"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, drawOverScreen, drawStartScreen, makeArcade, rainbow, type Arcade, type ShopRow } from "./PinkShop";
import { isPhoneOrTablet } from "./device";

// PINK SNAKE: the snake smokes a joint and eats weed leaves. Every leaf = longer + faster.
//   ARROWS / W A S D / swipe / click wheel = steer      SPACE / OK / tap = start
//   ← → on the start screen = CLASSIC (walls kill you) or NO WALLS (you come out the other side)
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// After 10 leaves, speaker blocks start to show up: don't crash into them.
// MONEY: LEAVES. Green leaf = 1, purple leaf = 5. Spend them in the PINK SHOP on skins and upgrades.
// ONLINE TOP 10: board id "snake" (see Scoreboard.tsx).

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  touch?: boolean;
};

type Mode = "ready" | "running" | "dying" | "over";
type Cell = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number; maxLife: number; size: number };

const GAME_TITLE = "PINK SNAKE";

// Game size in pixels (the PSP screen). It gets scaled up to fill the screen.
const W = 320;
const H = 150;

// The play field: 38 x 16 squares of 8 pixels
const CELL = 8;
const COLS = 38;
const ROWS = 16;
const OX = 8;
const OY = 18;

// ---------- EASY TUNING ----------
const START_STEP = 0.15; // seconds per step at the start (smaller = faster)
const MIN_STEP = 0.065;
const SPEEDUP = 0.0025; // per leaf eaten
const BLOCKS_FROM = 10; // speaker blocks start after this many leaves...
const BLOCK_EVERY = 5; // ...and one more every this many leaves
const MAX_BLOCKS = 14;
const WHEEL_TURN = 40; // degrees of click wheel = one turn

// Saved in the visitor's browser
const BEST_KEY = "pinksnake-best";
const MODE_KEY = "pinksnake-mode"; // "walls" / "wrap"
const FX_KEY = "pinksnake-fx";
const SHOP_KEY = "pinksnake-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const INK = "#111111";
const PINK = "#d63cc8";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const PURPLE = "#b04ad8";
const DARK_PURPLE = "#6a2a8a";
const SMOKE = ["#8a8a8a", "#a5a5a5", "#bdbdbd", "#707070"];
const BOOM = [PINK, "#8a1f86", "#ffc800", INK, "#ffffff"];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 40 },
  { id: "ice", name: "ICE", price: 80 },
  { id: "fire", name: "FIRE", price: 120 },
  { id: "ghost", name: "GHOST", price: 160 },
  { id: "rainbow", name: "RAINBOW", price: 220 },
  { id: "gold", name: "SILVER", price: 350 },
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "SKINS" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} SNAKE`, prices: [k.price], wear: true, info: [`A ${k.name} SNAKE`, ""] })),
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:shield", name: "SECOND CHANCE", prices: [150, 400], info: ["SURVIVE A CRASH: YOU TURN AWAY", "ONCE A GAME, TWICE AT LEVEL 2"] },
  { kind: "item", id: "up:lucky", name: "LUCKY LEAVES", prices: [50, 120, 250], info: ["MORE PURPLE LEAVES", "AND EACH ONE IS WORTH MORE"] },
  { kind: "item", id: "up:chill", name: "CHILL START", prices: [60, 150], info: ["THE SNAKE STARTS SLOWER", "SO THE FIRST LEAVES ARE EASY"] },
  { kind: "back" },
];

const LEAF_PIXELS = ["...G...", "..GGG..", "G.GGG.G", "GGGGGGG", ".GGGGG.", "...D...", "...D..."];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, purple = false) {
  for (let r = 0; r < LEAF_PIXELS.length; r++) {
    for (let c = 0; c < LEAF_PIXELS[r].length; c++) {
      const ch = LEAF_PIXELS[r][c];
      if (ch === "G" || ch === "D") {
        if (purple) ctx.fillStyle = ch === "G" ? PURPLE : DARK_PURPLE;
        else ctx.fillStyle = ch === "G" ? GREEN : DARK_GREEN;
        ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }
}
// the money icon: a little leaf
const leafIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => drawLeaf(ctx, x, y);

// one piece of the snake in a skin (main colour + a dark dot)
function skinColors(skin: string, t: number, i: number): [string, string] {
  if (skin === "rainbow") return [rainbow(t, i), INK];
  const c = SKIN_COLORS[skin] ?? SKIN_COLORS.pink;
  return [c[1], c[0]];
}

export default function SnakeGame({ actionSignal, spinRef, fontFamily, muted, touch = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<ScoreApi | null>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const pressRef = useRef<(() => void) | null>(null);
  const arcRef = useRef<Arcade | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coarse = isPhoneOrTablet(); // a real phone or tablet (a computer with a touch screen still says CLICK)
    const isTouch = () => touchRef.current || coarse;

    // ---------- state ----------
    const s = {
      mode: "ready" as Mode,
      wrap: false, // NO WALLS mode
      snake: [] as Cell[], // [0] is the head
      dir: { x: 1, y: 0 } as Cell,
      queue: [] as Cell[], // turns waiting to happen
      grow: 0,
      leaf: { x: 20, y: 8 } as Cell,
      bonus: null as Cell | null,
      bonusTime: 0,
      blocks: [] as Cell[], // speaker blocks
      step: START_STEP,
      acc: 0,
      wheelAcc: 0,
      score: 0,
      best: 0,
      eaten: 0,
      run: 0, // leaves (money) this game
      saves: 0, // SECOND CHANCE saves left this game
      ghost: 0, // blinking after a save
      newBest: false,
      particles: [] as Particle[],
      smokeTimer: 0,
      t: 0, // time in this mode
      clock: 0,
      runTime: 0,
      shake: 0,
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
      s.wrap = localStorage.getItem(MODE_KEY) === "wrap";
    } catch {}

    // ---------- pause, shop, FX (the same in every game, see PinkShop.ts) ----------
    const bankRun = () => {
      if (s.run > 0) arc.shop.add(s.run);
      s.run = 0;
    };
    const arc = makeArcade({
      W,
      H,
      font: fontFamily,
      fxKey: FX_KEY,
      shopKey: SHOP_KEY,
      rows: SHOP_ROWS,
      moneyName: "LEAVES",
      icon: leafIcon,
      preview: (c, id, box, t) => drawPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      panelPreview: (c, cx, cy, t) => drawPreview(c, arc.shop.wearing("skin"), cx, cy, t),
      ink: INK,
      muted: () => mutedRef.current,
      touch: isTouch,
      playing: () => s.mode === "running",
      menuScreen: () => s.mode === "ready" || (s.mode === "over" && s.t > 0.6),
      busy: () => boardRef.current?.busy() ?? false,
      restart: () => {
        newGame();
        s.mode = "running";
      },
      leaving: () => {
        if (s.mode === "running") bankRun();
      },
      stats: () => `SCORE ${pad(s.score)}  +${s.run} LEAVES`,
      pauseBtn: { x: W / 2 - 6, y: 3 },
    });
    arcRef.current = arc;
    const beep = arc.beep;
    const deathSound = new Audio(DEATH_SOUND);

    // ---------- sounds ----------
    const playEat = () => beep(520, 980, 0.07, 0.1);
    const playBonus = () => [523, 659, 784, 1047].forEach((f, i) => beep(f, f, 0.1, 0.08, "square", i * 0.07));
    const playSave = () => [880, 660, 990].forEach((f, i) => beep(f, f, 0.08, 0.07, "square", i * 0.06));
    const playStart = () => beep(220, 660, 0.15, 0.05, "square");
    const playDeath = () => {
      const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
      if (g <= 0) return;
      deathSound.volume = g;
      deathSound.currentTime = 0;
      deathSound.play().catch(() => {});
    };

    // ---------- the game ----------
    const blocked = (x: number, y: number) => s.blocks.some((b) => b.x === x && b.y === y);
    const onSnake = (x: number, y: number) => s.snake.some((c) => c.x === x && c.y === y);
    const randomFreeCell = (awayFromHead = 0): Cell => {
      const head = s.snake[0];
      for (let tries = 0; tries < 600; tries++) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (onSnake(x, y) || blocked(x, y)) continue;
        if (s.leaf && s.leaf.x === x && s.leaf.y === y) continue;
        if (s.bonus && s.bonus.x === x && s.bonus.y === y) continue;
        if (awayFromHead && head && Math.abs(head.x - x) + Math.abs(head.y - y) < awayFromHead) continue;
        return { x, y };
      }
      return { x: 0, y: 0 };
    };

    const newGame = () => {
      boardRef.current?.hide();
      const y = Math.floor(ROWS / 2);
      s.snake = [
        { x: 8, y },
        { x: 7, y },
        { x: 6, y },
        { x: 5, y },
      ];
      s.dir = { x: 1, y: 0 };
      s.queue = [];
      s.grow = 0;
      s.bonus = null;
      s.bonusTime = 0;
      s.blocks = [];
      s.step = START_STEP + arc.shop.lvl("chill") * 0.015;
      s.acc = 0;
      s.wheelAcc = 0;
      s.score = 0;
      s.eaten = 0;
      s.run = 0;
      s.saves = arc.shop.lvl("shield");
      s.ghost = 0;
      s.newBest = false;
      s.runTime = 0;
      s.t = 0;
      s.particles = [];
      s.leaf = { x: 24, y };
      playStart();
    };

    // Where the next turn starts from (the last one waiting, or the current direction)
    const lastDir = () => (s.queue.length ? s.queue[s.queue.length - 1] : s.dir);
    // Steer to an exact direction (arrows, swipes)
    const steer = (x: number, y: number) => {
      if (s.mode !== "running") return;
      const last = lastDir();
      if ((last.x === x && last.y === y) || (last.x === -x && last.y === -y)) return;
      if (s.queue.length < 3) s.queue.push({ x, y });
    };
    // Turn left / right from where it's heading (click wheel)
    const turn = (right: boolean) => {
      const last = lastDir();
      if (right) steer(-last.y, last.x);
      else steer(last.y, -last.x);
    };
    const toggleMode = () => {
      s.wrap = !s.wrap;
      beep(500, 750, 0.06, 0.05);
      try {
        localStorage.setItem(MODE_KEY, s.wrap ? "wrap" : "walls");
      } catch {}
    };

    // OK / Enter / Space / tapping the screen
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        newGame();
        s.mode = "running";
      } else if (s.mode === "over" && s.t > 0.6) {
        if (boardRef.current?.busy()) return; // the Top 10 box is still open
        newGame();
        s.mode = "running";
      }
    };
    pressRef.current = press;

    const px = (c: Cell) => OX + c.x * CELL;
    const py = (c: Cell) => OY + c.y * CELL;
    // Tip of the joint, in pixels
    const jointTip = () => {
      const head = s.snake[0];
      return { x: px(head) + CELL / 2 + s.dir.x * 9, y: py(head) + CELL / 2 + s.dir.y * 9 };
    };
    const puff = (x: number, y: number, count: number, spread: number) => {
      for (let i = 0; i < count; i++) {
        const life = rand(0.8, 1.5);
        s.particles.push({ x: x + rand(-1, 1), y: y + rand(-1, 1), vx: rand(-spread, spread), vy: rand(-22, -8), color: SMOKE[Math.floor(Math.random() * SMOKE.length)], life, maxLife: life, size: Math.random() < 0.4 ? 3 : 2 });
      }
    };
    const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
      for (let i = 0; i < count; i++) {
        const life = rand(0.4, 1.0);
        s.particles.push({ x, y, vx: rand(-power, power), vy: rand(-power, power), color: colors[Math.floor(Math.random() * colors.length)], life, maxLife: life, size: 2 });
      }
    };

    const die = () => {
      s.mode = "dying";
      s.t = 0;
      s.shake = 0.35;
      s.snake.forEach((c, i) => burst(px(c) + CELL / 2, py(c) + CELL / 2, i === 0 ? 20 : 4, BOOM, i === 0 ? 90 : 50));
      puff(px(s.snake[0]) + 4, py(s.snake[0]) + 4, 10, 20);
      if (s.score > s.best) {
        s.best = Math.floor(s.score);
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playDeath();
    };
    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      const got = s.run;
      bankRun();
      s.run = got; // (shown as "+N LEAVES SAVED")
      boardRef.current?.gameOver(Math.floor(s.score), s.runTime);
    };

    // SECOND CHANCE: instead of crashing, turn left or right (whichever is free)
    const trySave = () => {
      if (s.saves <= 0 || s.ghost > 0) return false;
      const head = s.snake[0];
      const opts = [
        { x: -s.dir.y, y: s.dir.x },
        { x: s.dir.y, y: -s.dir.x },
      ].sort(() => Math.random() - 0.5);
      for (const d of opts) {
        let nx = head.x + d.x;
        let ny = head.y + d.y;
        if (s.wrap) {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (blocked(nx, ny) || s.snake.slice(0, -1).some((c) => c.x === nx && c.y === ny)) continue;
        s.dir = d;
        s.queue = [];
        s.saves -= 1;
        s.ghost = 1;
        burst(px(head) + 4, py(head) + 4, 14, ["#ffffff", PINK], 50);
        playSave();
        return true;
      }
      return false;
    };

    // One step of the snake
    const tick = () => {
      if (s.queue.length) s.dir = s.queue.shift() as Cell;
      const head = s.snake[0];
      let next = { x: head.x + s.dir.x, y: head.y + s.dir.y };
      if (s.wrap) next = { x: (next.x + COLS) % COLS, y: (next.y + ROWS) % ROWS };
      const body = s.grow > 0 ? s.snake : s.snake.slice(0, -1);
      const crash =
        next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS || blocked(next.x, next.y) || body.some((c) => c.x === next.x && c.y === next.y);
      if (crash) {
        if (!trySave()) die();
        return; // (a save skips this step: next step goes the new way)
      }

      s.snake.unshift(next);
      if (s.grow > 0) s.grow -= 1;
      else s.snake.pop();

      // Green leaf: grow by 1
      if (next.x === s.leaf.x && next.y === s.leaf.y) {
        s.grow += 1;
        s.score += 10;
        s.eaten += 1;
        s.run += 1;
        s.step = Math.max(MIN_STEP, s.step - SPEEDUP);
        const tip = jointTip();
        puff(tip.x, tip.y, 8, 14); // big exhale
        burst(px(next) + 4, py(next) + 4, 8, [GREEN, DARK_GREEN], 40);
        playEat();
        s.leaf = randomFreeCell();
        // Sometimes a rare purple leaf shows up for a few seconds (LUCKY LEAVES = more often)
        if (!s.bonus && s.eaten >= 3 && Math.random() < 0.18 + arc.shop.lvl("lucky") * 0.06) {
          s.bonus = randomFreeCell();
          s.bonusTime = 6;
        }
        // speaker blocks
        if (s.eaten >= BLOCKS_FROM && (s.eaten - BLOCKS_FROM) % BLOCK_EVERY === 0 && s.blocks.length < MAX_BLOCKS) {
          s.blocks.push(randomFreeCell(6));
        }
      }
      // Purple leaf: bonus points, grow by 3
      if (s.bonus && next.x === s.bonus.x && next.y === s.bonus.y) {
        s.grow += 3;
        s.score += 50;
        s.run += 5 + arc.shop.lvl("lucky") * 2;
        const tip = jointTip();
        puff(tip.x, tip.y, 14, 18);
        burst(px(next) + 4, py(next) + 4, 14, [PURPLE, DARK_PURPLE, "#ffffff"], 55);
        playBonus();
        s.bonus = null;
      }
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.ghost > 0) s.ghost -= dt;
      for (const p of s.particles) {
        p.x += p.vx * dt + Math.sin(s.clock * 6 + p.y) * 0.1;
        p.y += p.vy * dt;
        p.vx *= 1 - 1.5 * dt;
        p.life -= dt;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // Click wheel: turning it turns the snake
      s.wheelAcc += spinRef.current;
      spinRef.current = 0;
      if (s.mode !== "running") s.wheelAcc = 0;
      while (s.wheelAcc >= WHEEL_TURN) {
        turn(true);
        s.wheelAcc -= WHEEL_TURN;
      }
      while (s.wheelAcc <= -WHEEL_TURN) {
        turn(false);
        s.wheelAcc += WHEEL_TURN;
      }

      if (s.mode === "dying") {
        if (s.t > 1.3) gameOver();
        return;
      }
      // The joint is always smoking (also on the start screen)
      if (s.mode === "running" || s.mode === "ready") {
        s.smokeTimer -= dt;
        if (s.smokeTimer <= 0 && s.snake.length) {
          const tip = jointTip();
          puff(tip.x, tip.y - 1, 1, 5);
          s.smokeTimer = 0.12;
        }
      }
      if (s.mode !== "running") return;
      s.runTime += dt;
      if (s.bonus) {
        s.bonusTime -= dt;
        if (s.bonusTime <= 0) s.bonus = null;
      }
      s.acc += dt;
      while (s.acc >= s.step && s.mode === "running") {
        s.acc -= s.step;
        tick();
      }
    };

    // ---------- drawing ----------
    const drawSnake = (c: CanvasRenderingContext2D, body: Cell[], dir: Cell, skin: string, t: number, ox: number, oy: number) => {
      const n = body.length;
      if (!n) return;
      for (let i = n - 1; i >= 1; i--) {
        const x = ox + body[i].x * CELL;
        const y = oy + body[i].y * CELL;
        const tail = i === n - 1;
        const [main, dark] = skinColors(skin, t, i);
        c.globalAlpha = skin === "ghost" ? 0.75 : 1;
        c.fillStyle = INK;
        if (tail) c.fillRect(x + 1, y + 1, 6, 6);
        else c.fillRect(x, y, 8, 8);
        c.fillStyle = main;
        if (tail) c.fillRect(x + 2, y + 2, 4, 4);
        else c.fillRect(x + 1, y + 1, 6, 6);
        if (!tail && i % 2 === 0) {
          c.fillStyle = dark;
          c.fillRect(x + 3, y + 3, 2, 2);
        }
      }
      c.globalAlpha = 1;
      // Head
      const x = ox + body[0].x * CELL;
      const y = oy + body[0].y * CELL;
      c.fillStyle = INK;
      c.fillRect(x - 1, y - 1, 10, 10);
      c.fillStyle = skinColors(skin, t, 0)[0];
      c.fillRect(x, y, 8, 8);
      // Eyes on the side it's heading to
      c.fillStyle = "#ffffff";
      const eyes: [number, number][] =
        dir.x === 1 ? [[5, 1], [5, 5]] : dir.x === -1 ? [[1, 1], [1, 5]] : dir.y === -1 ? [[1, 1], [5, 1]] : [[1, 5], [5, 5]];
      for (const [ex, ey] of eyes) c.fillRect(x + ex, y + ey, 2, 2);
      c.fillStyle = INK;
      for (const [ex, ey] of eyes) c.fillRect(x + ex + (dir.x === 1 ? 1 : 0), y + ey + (dir.y === 1 ? 1 : 0), 1, 1);
      // The joint sticking out of its mouth, with a glowing tip
      const cy = y + 4;
      const cx = x + 4;
      const glow = Math.floor(t * 6) % 2 === 0 ? "#ff7a00" : "#ffc800";
      if (dir.x !== 0) {
        const jx = dir.x === 1 ? x + 8 : x - 6;
        c.fillStyle = "#f2f2f2";
        c.fillRect(jx, cy, 6, 2);
        c.fillStyle = glow;
        c.fillRect(dir.x === 1 ? jx + 5 : jx, cy, 2, 2);
      } else {
        const jy = dir.y === 1 ? y + 8 : y - 6;
        c.fillStyle = "#f2f2f2";
        c.fillRect(cx - 1, jy, 2, 6);
        c.fillStyle = glow;
        c.fillRect(cx - 1, dir.y === 1 ? jy + 5 : jy, 2, 2);
      }
    };

    const drawBlock = (c: CanvasRenderingContext2D, x: number, y: number) => {
      c.fillStyle = INK;
      c.fillRect(x, y, 8, 8);
      c.fillStyle = PINK;
      c.fillRect(x + 2, y + 2, 4, 4);
      c.fillStyle = INK;
      c.fillRect(x + 3, y + 3, 2, 2);
    };

    // the shop's preview box + the SHOP panel: a little snake going round, or an upgrade's picture
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = SCREEN;
      c.fillRect(cx - 40, cy - 40, 80, 80);
      if (!id || id.startsWith("skin:")) {
        const skin = id ? id.split(":")[1] : arc.shop.wearingName("skin");
        // a snake going round in a small square
        const loop: Cell[] = [];
        for (let i = 0; i < 4; i++) loop.push({ x: i, y: 0 });
        for (let i = 0; i < 3; i++) loop.push({ x: 3, y: i + 1 });
        for (let i = 0; i < 3; i++) loop.push({ x: 2 - i, y: 3 });
        for (let i = 0; i < 2; i++) loop.push({ x: 0, y: 2 - i });
        const k = Math.floor(t * 6) % loop.length;
        const body: Cell[] = [];
        for (let i = 0; i < 6; i++) body.push(loop[(k - i + loop.length * 2) % loop.length]);
        const a = body[0];
        const b = body[1];
        drawSnake(c, body, { x: a.x - b.x || 1, y: a.y - b.y }, skin, t, cx - 16, cy - 16);
        return;
      }
      if (id === "up:shield") {
        const r = 12 + Math.sin(t * 5) * 2;
        c.strokeStyle = PINK;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
        drawSnake(c, [{ x: 0, y: 0 }], { x: 1, y: 0 }, arc.shop.wearingName("skin"), t, cx - 4, cy - 4);
      } else if (id === "up:lucky") {
        drawLeaf(c, cx - 12, cy - 4 + Math.round(Math.sin(t * 4) * 2), true);
        drawLeaf(c, cx + 5, cy - 4 + Math.round(Math.sin(t * 4 + 1) * 2), true);
      } else if (id === "up:chill") {
        // a little clock
        c.fillStyle = INK;
        c.beginPath();
        c.arc(cx, cy, 12, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(cx, cy, 10, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(t) * 8, cy + Math.sin(t) * 8);
        c.moveTo(cx, cy);
        c.lineTo(cx, cy - 6);
        c.stroke();
      }
    };

    const draw = () => {
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      ctx.fillStyle = SCREEN;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      // Play field border (dashed in NO WALLS mode: you can go through)
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      if (s.wrap) ctx.setLineDash([3, 3]);
      ctx.strokeRect(OX - 1.5, OY - 1.5, COLS * CELL + 3, ROWS * CELL + 3);
      ctx.setLineDash([]);

      for (const b of s.blocks) drawBlock(ctx, px(b), py(b));
      drawLeaf(ctx, px(s.leaf), py(s.leaf) + Math.round(Math.sin(s.clock * 5)));
      if (s.bonus && (s.bonusTime > 2 || Math.floor(s.clock * 8) % 2 === 0)) drawLeaf(ctx, px(s.bonus), py(s.bonus), true);

      const blink = s.ghost > 0 && Math.floor(s.clock * 12) % 2 === 0;
      if ((s.mode === "ready" || s.mode === "running") && !blink) drawSnake(ctx, s.snake, s.dir, arc.shop.wearingName("skin"), s.clock, OX, OY);

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife + 0.15));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // HUD (the speaker sits top left, so the score starts after it). Not on the start screen: it has its own.
      if (s.mode !== "ready") {
      ctx.font = `8px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.fillText(pad(s.score), 24, 5);
      if (s.saves > 0 && s.mode === "running") {
        ctx.fillStyle = PINK;
        for (let i = 0; i < s.saves; i++) ctx.fillRect(70 + i * 6, 6, 4, 4);
      }
      ctx.fillStyle = INK;
      ctx.textAlign = "right";
      ctx.fillText(`HI ${pad(s.best)}`, W - OX, 5);
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: s.wrap ? "< NO WALLS >" : "< CLASSIC >",
          lines: [
            ["EAT THE LEAVES", "#ffffff"],
            [s.wrap ? "GO THROUGH THE WALLS" : "DON'T HIT THE WALLS", KIT.lilac],
            ["OR YOURSELF", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${pad(top.score)}` : s.best > 0 ? `BEST ${pad(s.best)}` : undefined,
          hint: isTouch() ? "SWIPE TO STEER  TAP THE MODE TO SWITCH" : "← → = MODE   M = SOUNDS   - / + = FX",
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
          score: `SCORE ${pad(s.score)}`,
          best: `BEST ${pad(s.best)}`,
          newBest: s.newBest,
          stats: `${s.eaten} LEAVES  ${s.wrap ? "NO WALLS" : "CLASSIC"}`,
          again: isTouch() ? "TAP = AGAIN" : "SPACE = AGAIN",
          saved: `+${s.run} LEAVES SAVED`,
        });
        if (s.t > 0.4) arc.drawPanels(ctx, s.clock);
      }
      arc.drawOverlays(ctx, s.clock);
    };

    // ---------- keys ----------
    // (capture: true = before the page, so the pause menu / shop / FX keys go there first)
    const onKeyFirst = (e: KeyboardEvent) => {
      if (arc.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      if (s.mode === "ready" && (k === "ArrowLeft" || k === "ArrowRight" || k === "a" || k === "A" || k === "d" || k === "D")) {
        toggleMode();
        return;
      }
      if (k === "ArrowUp" || k === "w" || k === "W") steer(0, -1);
      if (k === "ArrowDown" || k === "s" || k === "S") steer(0, 1);
      if (k === "ArrowLeft" || k === "a" || k === "A") steer(-1, 0);
      if (k === "ArrowRight" || k === "d" || k === "D") steer(1, 0);
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);

    // ---------- taps + swipes ----------
    const toGame = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H);
      return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
    };
    let swipe: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const g = toGame(e.clientX, e.clientY);
      if (arc.tap(g.x, g.y)) {
        if (arc.dragging()) canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (arc.frozen()) return;
      // the mode line on the start screen
      if (s.mode === "ready" && g.y >= 32 && g.y < 48 && Math.abs(g.x - W / 2) < 70) {
        toggleMode();
        return;
      }
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (s.mode !== "running") press();
    };
    const onMove = (e: PointerEvent) => {
      if (arc.dragging()) {
        arc.drag(toGame(e.clientX, e.clientY).y);
        return;
      }
      // a swipe turns the moment the finger has slid far enough (no need to lift it)
      if (!swipe || swipe.id !== e.pointerId) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1, 0);
      else steer(0, dy > 0 ? 1 : -1);
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onUp = () => {
      if (arc.dragging()) arc.drag(-1);
      swipe = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // switching apps / tabs pauses the game
    const onHidden = () => {
      if (document.hidden && s.mode === "running") arc.setPause(true);
    };
    document.addEventListener("visibilitychange", onHidden);

    newGame();
    s.mode = "ready";
    s.run = 0;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // (never below 0: the first frame can be a hair early)
      last = now;
      s.clock += dt;
      arc.tick(dt);
      if (arc.frozen()) spinRef.current = 0;
      else update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyFirst, true);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onHidden);
      if (s.mode === "running") bankRun(); // leaving with EXIT / BACKSPACE: keep the leaves from this game
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
          background: SCREEN,
          touchAction: "none",
          cursor: "pointer",
        }}
      />
      <ScorePanel game="snake" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} />
    </>
  );
}
