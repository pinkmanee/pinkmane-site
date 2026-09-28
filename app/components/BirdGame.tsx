"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
};

type Mode = "ready" | "running" | "dying" | "entry" | "board";
type Tower = { x: number; gapY: number; gap: number; passed: boolean };
type Leaf = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the iPod screen.
const W = 256;
const H = 160;
const GROUND = 150;
const BIRD_X = 60;
const BIRD_W = 16;
const BIRD_H = 12;

// Feel of the game
const GRAVITY = 520;
const FLAP = -165;
const START_SPEED = 68;
const MAX_SPEED = 115;
const TOWER_W = 22;
const TOWER_SPACING = 112;
const START_GAP = 60;
const MIN_GAP = 44;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinkbird-best";
const SFX_KEY = "pinkbird-sfx"; // remembers if game sounds are on or off
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const FEATHERS = [PINK, DARK_PINK, "#ffc800", "#ffffff", INK];

// The bird: two frames (wing up, wing down)
const BIRD_FRAMES = [
  [
    "...P..P..P......",
    "...PP.PP.PP.....",
    "....PPPPPPP.....",
    "...KKKKKKKKK....",
    "..KDDPPPPWWWK...",
    ".KDDDDPPWWKWK...",
    ".KPDDPPPPWWWKYY.",
    "KPPPPPPPPPPPKYYY",
    "KPPPPPPPPPPKYYY.",
    ".KPPPPPPPPPPKK..",
    "..KKPPPPPPPKK...",
    "....KKKKKKK.....",
  ],
  [
    "...P..P..P......",
    "...PP.PP.PP.....",
    "....PPPPPPP.....",
    "...KKKKKKKKK....",
    "..KPPPPPPWWWK...",
    ".KPPPPPPWWKWK...",
    ".KPPPPPPPWWWKYY.",
    "KPPPPPPPPPPPKYYY",
    "KDDDDDPPPPPKYYY.",
    ".KDDDDPPPPPPKK..",
    "..KDDPPPPPPKK...",
    "....KKKKKKK.....",
  ],
];

const LEAF_PIXELS = [
  "...G...",
  "..GGG..",
  "G.GGG.G",
  "GGGGGGG",
  ".GGGGG.",
  "...D...",
  "...D...",
];

const COLORS: Record<string, string> = {
  P: PINK,
  D: DARK_PINK,
  K: INK,
  W: "#ffffff",
  Y: "#ffc800",
  G: GREEN,
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

function drawPixels(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, dark = DARK_GREEN) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      const color = ch === "D" && rows === LEAF_PIXELS ? dark : COLORS[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }
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

export default function BirdGame({ actionSignal, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Game sounds on/off (separate from the music): speaker icon top-left or the M key
  const sfxOnRef = useRef(true);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);

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
    y: 70,
    vy: 0,
    flapTime: 0,
    towers: [] as Tower[],
    leaves: [] as Leaf[],
    particles: [] as Particle[],
    speed: START_SPEED,
    score: 0,
    best: 0,
    passed: 0,
    groundOffset: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
    shake: 0,
    flash: 0,
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

  // Soft and quiet, since it plays on every flap
  const playFlap = () => beep(420, 560, 0.04, 0.03, "sine");
  const playPoint = () => {
    beep(880, 880, 0.05, 0.045);
    beep(1320, 1320, 0.07, 0.045, "square", 0.05);
  };
  const playLeaf = () => [523, 659, 784, 1047].forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.06));
  const playHit = () => beep(200, 60, 0.18, 0.18, "square");
  const playDeath = () => {
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current && sfxOnRef.current) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  // ---------- Scoreboard ----------

  const loadBoard = async () => {
    try {
      const res = await fetch("/api/scores?game=bird", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      boardRef.current = Array.isArray(data.scores) ? data.scores : [];
      boardStatusRef.current = "ok";
    } catch {
      boardStatusRef.current = "offline";
    }
  };

  const qualifies = (score: number) => {
    if (boardStatusRef.current !== "ok" || score < 1) return false;
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
          game: "bird",
          name: clean,
          score: Math.floor(s.score),
          runTime: s.runTime,
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

  const currentGap = () => Math.max(MIN_GAP, START_GAP - state.current.passed * 0.6);

  const addTower = (x: number) => {
    const s = state.current;
    const gap = currentGap();
    const gapY = rand(22 + gap / 2, GROUND - 16 - gap / 2);
    s.towers.push({ x, gapY, gap, passed: false });
    // Sometimes a weed leaf floats in the gap: +5 points
    if (s.passed >= 2 && Math.random() < 0.22) {
      s.leaves.push({ x: x + TOWER_W / 2 - 3, y: gapY - 3 });
    }
  };

  const newGame = () => {
    const s = state.current;
    s.y = 70;
    s.vy = 0;
    s.towers = [];
    s.leaves = [];
    s.particles = [];
    s.speed = START_SPEED;
    s.score = 0;
    s.passed = 0;
    s.runTime = 0;
    s.shake = 0;
    addTower(W + 40);
  };

  const flap = () => {
    const s = state.current;
    s.vy = FLAP;
    s.flapTime = 0.15;
    // Little puff of feathers under the bird
    for (let i = 0; i < 3; i++) {
      s.particles.push({
        x: BIRD_X + 4,
        y: s.y + BIRD_H,
        vx: rand(-30, -10),
        vy: rand(10, 30),
        color: Math.random() < 0.5 ? PINK : "#ffffff",
        life: rand(0.2, 0.4),
        size: 1,
      });
    }
    playFlap();
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power * 1.4, power * 0.4),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.5, 1.2),
        size: 2,
      });
    }
  };

  const toggleSfx = () => {
    sfxOnRef.current = !sfxOnRef.current;
    try {
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  // Little speaker in the top-left corner: with sound waves when on, an X when off
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

  // Called on OK / Enter / Space / tapping the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "ready") {
      s.mode = "running";
      flap();
    } else if (s.mode === "running") {
      flap();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      newGame();
      s.mode = "running";
      flap();
    }
  };

  const die = () => {
    const s = state.current;
    s.mode = "dying";
    s.deadAt = s.t;
    s.shake = 0.35;
    s.flash = 0.08;
    burst(BIRD_X + BIRD_W / 2, s.y + BIRD_H / 2, 40, FEATHERS, 90);
    if (s.score > s.best) {
      s.best = Math.floor(s.score);
      try {
        localStorage.setItem(BEST_KEY, String(s.best));
      } catch {}
    }
    playHit();
    playDeath();
  };

  const finishDeath = () => {
    const s = state.current;
    if (qualifies(Math.floor(s.score))) {
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
    if (s.flash > 0) s.flash -= dt;
    if (s.flapTime > 0) s.flapTime -= dt;

    for (const p of s.particles) {
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);

    if (s.mode === "dying") {
      if (s.t - s.deadAt > 1.5) finishDeath();
      return;
    }

    // Bobbing on the start screen
    if (s.mode === "ready") {
      s.y = 70 + Math.sin(s.t * 3) * 4;
      s.groundOffset += START_SPEED * dt * 0.5;
      return;
    }
    if (s.mode !== "running") return;

    s.runTime += dt;

    // Falling and flapping
    s.vy = Math.min(260, s.vy + GRAVITY * dt);
    s.y += s.vy * dt;
    if (s.y < -4) {
      s.y = -4;
      s.vy = 0;
    }

    // Move the world
    const move = s.speed * dt;
    s.groundOffset += move;
    for (const t of s.towers) t.x -= move;
    for (const l of s.leaves) l.x -= move;
    s.towers = s.towers.filter((t) => t.x + TOWER_W > -4);
    s.leaves = s.leaves.filter((l) => l.x > -10);

    const lastTower = s.towers[s.towers.length - 1];
    if (!lastTower || lastTower.x < W - TOWER_SPACING) addTower(W + 4);

    // Hitbox a bit smaller than the drawing (mohawk and beak tip don't count)
    const bx1 = BIRD_X + 2;
    const bx2 = BIRD_X + BIRD_W - 2;
    const by1 = s.y + 4;
    const by2 = s.y + BIRD_H - 1;

    // Ground
    if (by2 >= GROUND) {
      s.y = GROUND - BIRD_H;
      die();
      return;
    }

    for (const t of s.towers) {
      // Score when the bird passes a tower
      if (!t.passed && t.x + TOWER_W < bx1) {
        t.passed = true;
        s.passed += 1;
        s.score += 1;
        s.speed = Math.min(MAX_SPEED, START_SPEED + s.passed * 1.5);
        playPoint();
      }
      // Hit a tower
      const top = t.gapY - t.gap / 2;
      const bottom = t.gapY + t.gap / 2;
      if (bx2 > t.x && bx1 < t.x + TOWER_W && (by1 < top || by2 > bottom)) {
        die();
        return;
      }
    }

    // Weed leaves: +5
    for (const l of s.leaves) {
      if (bx2 > l.x && bx1 < l.x + 7 && by2 > l.y && by1 < l.y + 7) {
        s.score += 5;
        burst(l.x + 3, l.y + 3, 12, [GREEN, DARK_GREEN, "#ffffff"], 45);
        playLeaf();
        l.x = -100;
      }
    }
  };

  // A tower of stacked speakers
  const drawTower = (ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, capAtBottom: boolean) => {
    const rx = Math.round(x);
    const h = Math.round(y2 - y1);
    if (h <= 0) return;
    ctx.fillStyle = INK;
    ctx.fillRect(rx, Math.round(y1), TOWER_W, h);
    // Speaker cones
    for (let yy = Math.round(y1) + 3; yy + 12 < y2; yy += 16) {
      ctx.fillStyle = PINK;
      ctx.fillRect(rx + 7, yy + 2, 8, 8);
      ctx.fillStyle = INK;
      ctx.fillRect(rx + 9, yy + 4, 4, 4);
      ctx.fillStyle = PINK;
      ctx.fillRect(rx + 10, yy + 5, 2, 2);
    }
    // Lip at the open end
    ctx.fillStyle = DARK_PINK;
    const lipY = capAtBottom ? Math.round(y2) - 5 : Math.round(y1);
    ctx.fillRect(rx - 2, lipY, TOWER_W + 4, 5);
    ctx.fillStyle = INK;
    ctx.fillRect(rx - 2, capAtBottom ? lipY + 4 : lipY, TOWER_W + 4, 1);
  };

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
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
      ctx.fillText("GAME OVER", W / 2, 40);
      ctx.fillText(`SCORE ${pad(s.score)}`, W / 2, 58);
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
        ctx.fillText(pad(e.score), W - 28, y);
      });
      ctx.textAlign = "center";
      ctx.fillText(`YOU ${pad(s.score)}`, W / 2, 134);
    }

    if (Math.floor(s.t * 2) % 2 === 0) ctx.fillText("OK TO PLAY AGAIN", W / 2, 148);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;

    if (s.mode === "board") {
      drawBoard(ctx);
      return;
    }

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));

    ctx.fillStyle = SCREEN;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    // Towers
    for (const t of s.towers) {
      drawTower(ctx, t.x, -4, t.gapY - t.gap / 2, true);
      drawTower(ctx, t.x, t.gapY + t.gap / 2, GROUND, false);
    }

    // Leaves
    for (const l of s.leaves) drawPixels(ctx, LEAF_PIXELS, l.x, l.y + Math.round(Math.sin(s.t * 5)));

    // Ground
    ctx.fillStyle = INK;
    ctx.fillRect(-4, GROUND, W + 8, 1);
    for (let i = 0; i < W / 16 + 1; i++) {
      const gx = Math.round((((i * 16 - s.groundOffset) % W) + W) % W);
      ctx.fillRect(gx, GROUND + 4, 5, 1);
      ctx.fillRect((gx + 9) % W, GROUND + 7, 3, 1);
    }

    // Bird (flaps its wing after each press, and while floating on the start screen)
    if (s.mode === "ready" || s.mode === "running") {
      const frame = s.flapTime > 0 || (s.mode === "ready" && Math.floor(s.t * 6) % 2 === 0) ? 1 : 0;
      drawPixels(ctx, BIRD_FRAMES[frame], BIRD_X, s.y);
    }

    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    if (s.flash > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(-4, -4, W + 8, H + 8);
    }

    ctx.restore();

    drawSfxIcon(ctx);

    // Score: big in the middle while playing, like the original
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.fillText(`HI ${pad(s.best)}`, W - 6, 6);
    if (s.mode === "running" || s.mode === "dying") {
      ctx.textAlign = "center";
      ctx.font = `16px ${fontFamily}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(s.score), W / 2 + 1, 13);
      ctx.fillStyle = INK;
      ctx.fillText(String(s.score), W / 2, 12);
      ctx.font = `8px ${fontFamily}`;
    }

    // Messages
    ctx.textAlign = "center";
    const blink = Math.floor(s.t * 2) % 2 === 0;
    if (s.mode === "ready") {
      textBox(ctx, "PINK BIRD", 40);
      if (blink) textBox(ctx, "PRESS OK TO FLAP", 100);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 120);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 30);
      textBox(ctx, pad(s.score), 44);
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
    } catch {}

    // M key turns game sounds on/off
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "m" || e.key === "M") toggleSfx();
    };
    window.addEventListener("keydown", onKey);

    try {
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
      window.removeEventListener("keydown", onKey);
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
        onPointerDown={(e) => {
          // Tapping the speaker icon (top-left) turns game sounds on/off instead of flapping
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cx = (e.clientX - rect.left - (rect.width - W * scale) / 2) / scale;
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          if (cx < 24 && cy < 20) {
            toggleSfx();
            return;
          }
          if (state.current.mode !== "entry") press();
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          background: SCREEN,
          touchAction: "manipulation",
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
