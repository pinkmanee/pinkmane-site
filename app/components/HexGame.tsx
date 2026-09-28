"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
};

type Mode = "ready" | "running" | "dying" | "entry" | "board";
// One ring of walls coming in: which of the 6 sides have a wall, and how far away it is
type Wave = { d: number; sides: boolean[] };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the iPod screen.
const W = 256;
const H = 160;
const CX = 128;
const CY = 84;

const SIDE = Math.PI / 3; // 60 degrees
const COS30 = Math.cos(Math.PI / 6);
const PLAYER_R = 20; // how far the triangle circles from the center
const CORE = 11; // size of the center hexagon
const WALL_TH = 8; // wall thickness
const SPAWN_D = 175; // walls start this far out
const TURN_SPEED = 5.2; // keyboard / touch turning speed (radians per second)

// Beat pulse, same tempo as the site
const BPM = 140;
const BEAT = 60 / BPM;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinkhex-best";
const SFX_KEY = "pinkhex-sfx";
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

// Stage changes at these many seconds
const STAGES = [10, 20, 30, 45, 60, 90];

const SCREEN = "#d7efbc";
const SCREEN_DARK = "#c3e2a3";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const BOOM = [PINK, DARK_PINK, "#ffffff", INK, "#ffc800"];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randInt(n: number) {
  return Math.floor(Math.random() * n);
}

// Angle between -PI and PI
function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Scores are saved in hundredths of a second: 1234 = 12.34 seconds
function fmtTime(cs: number) {
  return (Math.floor(cs) / 100).toFixed(2);
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

function getOwnerCode() {
  try {
    return localStorage.getItem(OWNER_KEY) || "";
  } catch {
    return "";
  }
}

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
      for (let k = 0; k < 5; k++) {
        const gapSide = k * dir;
        out.push({
          sides: on([1, 2, 3, 4, 5].map((i) => i + gapSide)),
          gap: k === 4 ? space : 24,
        });
      }
      return out;
    }
    default: // two walls, then three, zig-zag
      return [
        { sides: on([0, 3]), gap: 30 },
        { sides: on([1, 2, 4, 5]), gap: space },
      ];
  }
}

export default function HexGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  // Game sounds on/off (separate from the music): speaker icon top-left or the M key
  const sfxOnRef = useRef(true);
  const heldRef = useRef({ ccw: false, cw: false });
  const touchRef = useRef<number>(0); // -1 = holding left side, 1 = right side

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
    flash: 0,
    flashText: "",
    textTimer: 0,
    particles: [] as Particle[],
    t: 0,
    deadAt: 0,
    shake: 0,
    whiteout: 0,
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
    if (mutedRef.current || !sfxOnRef.current) return;
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

  const playStart = () => beep(220, 880, 0.25, 0.05, "sawtooth");
  const playStage = () => [523, 784, 1047].forEach((f, i) => beep(f, f, 0.09, 0.05, "square", i * 0.08));
  const playHit = () => beep(300, 50, 0.3, 0.14, "sawtooth");
  const playDeath = () => {
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current && sfxOnRef.current) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  const toggleSfx = () => {
    sfxOnRef.current = !sfxOnRef.current;
    try {
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  // ---------- Scoreboard ----------

  const loadBoard = async () => {
    try {
      const res = await fetch("/api/scores?game=hex", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      boardRef.current = Array.isArray(data.scores) ? data.scores : [];
      boardStatusRef.current = "ok";
    } catch {
      boardStatusRef.current = "offline";
    }
  };

  const qualifies = (score: number) => {
    if (boardStatusRef.current !== "ok" || score < 100) return false;
    const b = boardRef.current;
    return b.length < 10 || score > b[b.length - 1].score;
  };

  const scoreNow = () => Math.floor(state.current.time * 100);

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
          game: "hex",
          name: clean,
          score: scoreNow(),
          runTime: s.time,
          device: getDeviceId(),
          ownerCode: getOwnerCode(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(String(data.error || "COULD NOT SAVE").toUpperCase());
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

  // ---------- Game ----------

  const wallSpeed = () => Math.min(120, 48 + state.current.time * 1.1);

  // Is there a wall touching the triangle if it stood at this angle?
  const blockedAt = (angle: number) => {
    const s = state.current;
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
    const s = state.current;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.05));
    const step = delta / steps;
    for (let i = 0; i < steps; i++) {
      const next = s.angle + step;
      if (blockedAt(next)) break;
      s.angle = wrap(next);
    }
  };

  const newGame = () => {
    const s = state.current;
    s.waves = [];
    s.queue = [];
    s.nextIn = 40;
    s.rot = 0;
    s.rotSpeed = 0.7;
    s.flipIn = rand(5, 8);
    s.time = 0;
    s.stage = 0;
    s.particles = [];
    s.whiteout = 0;
    s.angle = -Math.PI / 2;
  };

  // Called on OK / Enter / Space / tapping the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "ready") {
      s.mode = "running";
      playStart();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      newGame();
      s.mode = "running";
      playStart();
    }
  };

  const die = () => {
    const s = state.current;
    s.mode = "dying";
    s.deadAt = s.t;
    s.shake = 0.4;
    s.whiteout = 0.35;
    const px = Math.cos(s.angle + s.rot) * PLAYER_R;
    const py = Math.sin(s.angle + s.rot) * PLAYER_R;
    for (let i = 0; i < 40; i++) {
      s.particles.push({
        x: CX + px,
        y: CY + py,
        vx: rand(-110, 110),
        vy: rand(-110, 110),
        color: BOOM[randInt(BOOM.length)],
        life: rand(0.5, 1.2),
      });
    }
    const score = scoreNow();
    if (score > s.best) {
      s.best = score;
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {}
    }
    playHit();
    playDeath();
  };

  const finishDeath = () => {
    const s = state.current;
    if (qualifies(scoreNow())) {
      s.mode = "entry";
      setMessage("");
      setShowEntry(true);
    } else {
      s.mode = "board";
      s.deadAt = s.t;
    }
  };

  const update = (dt: number) => {
    const s = state.current;
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

    // The world keeps spinning slowly even on the start screen
    if (s.mode === "ready") {
      s.rot += 0.5 * dt;
      spinRef.current = 0;
      return;
    }
    if (s.mode === "dying") {
      s.rot += s.rotSpeed * 0.3 * dt;
      if (s.t - s.deadAt > 1.5) finishDeath();
      return;
    }
    if (s.mode !== "running") {
      spinRef.current = 0;
      return;
    }

    s.time += dt;

    // Your turning: click wheel, keyboard, touch
    const wheel = (spinRef.current * Math.PI) / 180;
    spinRef.current = 0;
    let turn = wheel;
    if (heldRef.current.ccw || touchRef.current < 0) turn -= TURN_SPEED * dt;
    if (heldRef.current.cw || touchRef.current > 0) turn += TURN_SPEED * dt;
    if (turn !== 0) moveBy(turn);

    // The world spins, faster over time, and sometimes flips direction
    const spin = Math.min(2.4, 0.7 + s.time * 0.025);
    s.rotSpeed = Math.sign(s.rotSpeed || 1) * spin;
    s.flipIn -= dt;
    if (s.flipIn <= 0) {
      s.rotSpeed = -s.rotSpeed;
      s.flipIn = rand(4, 8);
    }
    s.rot += s.rotSpeed * dt;

    // Stages
    if (s.stage < STAGES.length && s.time >= STAGES[s.stage]) {
      s.stage += 1;
      s.flashText = `STAGE ${s.stage + 1}`;
      s.textTimer = 1.4;
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

  // A point on a hexagon with this apothem (distance from center to the middle of an edge)
  const hexPoint = (apothem: number, corner: number) => {
    const r = apothem / COS30;
    const a = corner * SIDE;
    return [Math.cos(a) * r, Math.sin(a) * r];
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
      ctx.fillText("GAME OVER", W / 2, 40);
      ctx.fillText(`TIME ${fmtTime(scoreNow())}`, W / 2, 58);
      ctx.fillText(status === "loading" ? "LOADING SCORES..." : "SCOREBOARD OFFLINE", W / 2, 80);
    } else {
      ctx.fillText("TOP 10", W / 2, 8);
      const b = boardRef.current;
      if (b.length === 0) ctx.fillText("NO SCORES YET", W / 2, 60);
      b.slice(0, 10).forEach((e, i) => {
        const y = 22 + i * 11;
        if (e.name === myNameRef.current) {
          ctx.fillStyle = PINK;
          ctx.fillRect(24, y - 2, W - 48, 11);
        }
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        ctx.fillText(`${String(i + 1).padStart(2, " ")} ${e.name}`, 28, y);
        ctx.textAlign = "right";
        ctx.fillText(fmtTime(e.score), W - 28, y);
      });
      ctx.textAlign = "center";
      ctx.fillText(`YOU ${fmtTime(scoreNow())}`, W / 2, 134);
    }

    if (Math.floor(s.t * 2) % 2 === 0) ctx.fillText("OK TO PLAY AGAIN", W / 2, 148);
  };

  const drawSfxIcon = (ctx: CanvasRenderingContext2D) => {
    const x = 6;
    const y = 5;
    ctx.fillStyle = INK;
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

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
    ctx.fillText(text, W / 2, y);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;

    if (s.mode === "board") {
      drawBoard(ctx);
      return;
    }

    // Beat pulse: jumps on each beat, then settles
    const beatPhase = (s.t % BEAT) / BEAT;
    const pulse = Math.max(0, 1 - beatPhase * 4);

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-3, 3)), Math.round(rand(-3, 3)));
    ctx.translate(CX, CY);
    ctx.rotate(s.rot);

    // Background: 6 slices in two shades
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? SCREEN : SCREEN_DARK;
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
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.fill();
        // Pink inner edge
        ctx.strokeStyle = PINK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Center hexagon, pulsing to the beat
    const core = CORE + pulse * 2.5;
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const [x, y] = hexPoint(core, i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // You: the pink triangle
    if (s.mode === "ready" || s.mode === "running") {
      const a = s.angle;
      const tip = PLAYER_R + 4;
      const base = PLAYER_R - 1;
      ctx.fillStyle = PINK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * tip, Math.sin(a) * tip);
      ctx.lineTo(Math.cos(a - 0.2) * base, Math.sin(a - 0.2) * base);
      ctx.lineTo(Math.cos(a + 0.2) * base, Math.sin(a + 0.2) * base);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    // Explosion
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
    drawSfxIcon(ctx);
    ctx.textAlign = "right";
    const boxText = (text: string, x: number, y: number) => {
      const w = ctx.measureText(text).width + 6;
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(x - w + 3), y - 2, Math.round(w), 12);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, y);
    };
    boxText(`TIME ${fmtTime(scoreNow())}`, W - 5, 5);
    boxText(`BEST ${fmtTime(s.best)}`, W - 5, H - 13);

    // Messages
    ctx.textAlign = "center";
    const blink = Math.floor(s.t * 2) % 2 === 0;
    if (s.mode === "ready") {
      textBox(ctx, "PINK HEXAGON", 30);
      if (blink) textBox(ctx, "PRESS OK TO START", 124);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${fmtTime(top.score)}`, 140);
    } else if (s.mode === "running" && s.textTimer > 0) {
      textBox(ctx, s.flashText, 30);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 TIME!", 30);
      textBox(ctx, fmtTime(scoreNow()), 44);
    }
  };

  // Start the game loop once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    deathSoundRef.current = new Audio(DEATH_SOUND);

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

    try {
      sfxOnRef.current = localStorage.getItem(SFX_KEY) !== "off";
      const saved = Number(localStorage.getItem(BEST_KEY));
      if (saved > 0) state.current.best = saved;
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) {
        nameRef.current = savedName;
        setName(savedName);
      }
    } catch {}

    loadBoard();
    newGame();

    // Keyboard: hold ← / A to go left, → / D to go right, M = game sounds on/off
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") heldRef.current.ccw = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") heldRef.current.cw = true;
      if (e.key === "m" || e.key === "M") toggleSfx();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") heldRef.current.ccw = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") heldRef.current.cw = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls
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
        // Phones: hold the left or right half of the screen to move, tap to start.
        // The speaker icon (top-left) turns game sounds on/off.
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cx = (e.clientX - rect.left - (rect.width - W * scale) / 2) / scale;
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          if (cx < 24 && cy < 20) {
            toggleSfx();
            return;
          }
          const mode = state.current.mode;
          if (mode === "entry") return;
          if (mode !== "running") {
            press();
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          touchRef.current = cx < W / 2 ? -1 : 1;
        }}
        onPointerUp={() => {
          touchRef.current = 0;
        }}
        onPointerCancel={() => {
          touchRef.current = 0;
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
