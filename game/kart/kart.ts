// PINK KART (demo, track 1): a behind-the-kart racing game drawn on a pixel screen and blown up.
// The ground is one big flat picture (public/kart/track1-ground.png) tilted into 3D, like old SNES racers.
// Everything you see comes from the pictures in public/kart/ : swap a picture, the game changes.

type Img = HTMLImageElement | HTMLCanvasElement;
type TrackData = {
  size: number;
  center: [number, number][];
  halfw: number[];
  boosts: { x: number; y: number; a: number }[];
  boxes: [number, number][];
  props: [number, number, number][];
  lap: number;
};

const BW = 480; // the small pixel screen the race is drawn on (the chunky arcade look)
const BH = 270;
const UW = 480; // the menus, numbers and buttons are laid out on a 480 x 270 grid, stretched over the same screen
const UH = 270;
const HORIZON = 100;
const FOCAL = 260;
const CAM_H = 34;
const CAM_BACK = 65; // how far the camera sits behind your kart
const LAPS = 3;
// KARTS: every kart is 3 pictures (back, side, front) in public/kart/kart-<kart>-<view>.png, each with 3 frames side by side:
// no flame, flame, flame (the flames only show while boosting or revving at the start).
// k = world units per picture pixel. "mane" is PINKMANE's own drawn kart; for now every racer drives it in his own colour.
// To add a new drawn kart: put its 3 pictures in public/kart/, add it here, and give it to a racer in BOTS.
const CARS: Record<string, { k: number }> = {
  mane: { k: 0.25 }, // with the camera 65 behind, your own kart is drawn at exactly its drawn size
};
const VIEWS = ["back", "side", "front"];
// THE GRASS EDGE: how tall the grass along the road stands (in world units; a kart is about 19 tall), and its colours (0xAABBGGRR)
const GRASS_TALL = 4.5;
const GRASS_DARK = 0xff180612, GRASS_MID = 0xff96288c, GRASS_TIP = 0xffc846ff, GRASS_BANK = 0xff10040c;
const SPIN_TIME = 1.0; // a spin-out: two full turns, always this long
const GO_TIME = 3; // the countdown: 3 (0s) 2 (1s) 1 (2s) GO (3s)
const REV_FROM = 1; // hold the gas from when the 2 shows = ROCKET START. Earlier = TOO EARLY, the engine chokes
const MAX_SPEED = 235;
const ITEMS = ["bolt", "bomb", "vinyl", "mic", "bass", "mute", "wall"] as const;
type ItemName = (typeof ITEMS)[number];
const ITEM_LABEL: Record<ItemName, string> = {
  bolt: "SAMPLE SKIP",
  bomb: "808 BOMB",
  vinyl: "VINYL",
  mic: "AUTOTUNE",
  bass: "BASS DROP",
  mute: "MUTE",
  wall: "REVERB WALL",
};
// kart colours: the player keeps the drawn pink, the bots get these instead of pink
const BOTS: { name: string; car: string; color: [number, number, number] }[] = [
  { name: "808", car: "mane", color: [60, 220, 255] },
  { name: "SERUM", car: "mane", color: [150, 255, 80] },
  { name: "VOID", car: "mane", color: [255, 150, 40] },
  { name: "HEX", car: "mane", color: [150, 100, 255] },
  { name: "KONG", car: "mane", color: [255, 70, 90] },
];

type Kart = {
  name: string;
  player: boolean;
  skin: number;
  car: string;
  rev: number; // when the gas went down during the countdown (-1 = not held)
  stall: number; // the engine choked (pressed too early): seconds until it runs again
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  speed: number;
  idx: number;
  total: number;
  item: ItemName | null;
  roulette: number;
  useIn: number;
  spin: number;
  spinA: number;
  boost: number;
  blind: number;
  safe: number;
  off: number;
  lane: number;
  skill: number;
  finished: boolean;
  time: number;
  place: number;
  lost: number;
};
type Thing = {
  kind: "vinyl" | "wall" | "bomb" | "mic" | "boom" | "wave";
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  t: number;
  life: number;
  owner: Kart;
  idx: number;
};
type Sprite = { img: Img; sx: number; sw: number; sh: number; x: number; y: number; k: number; lift: number; flip: boolean; shadow: boolean; squash?: number };

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const PLACE = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"];
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

export class KartGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private frame: ImageData;
  private frame32: Uint32Array;
  private font: string;
  private base: string;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private dead = false;
  private ready = false;
  private loadError = "";

  private track!: TrackData;
  private ground!: Uint32Array;
  private gsize = 0; // the ground picture's size in pixels
  private gs = 1; // ground pixels per world unit
  private mask = new Uint8Array(BW * (BH - HORIZON)); // this frame: which screen pixels are field (1) and which are road (0)
  private seedMap = new Uint8Array(BW * (BH - HORIZON));
  private types!: Uint8Array;
  private img: Record<string, HTMLImageElement> = {};
  private kartSkins: Record<string, HTMLCanvasElement>[] = [];
  private mini!: HTMLCanvasElement;
  private boom!: HTMLCanvasElement;

  private karts: Kart[] = [];
  private me!: Kart;
  private things: Thing[] = [];
  private boxes: { x: number; y: number; back: number }[] = [];
  private state: "title" | "count" | "race" | "done" = "title";
  private clock = 0;
  private stateT = 0;
  private paused = false;
  private flash = "";
  private flashT = 0;
  private camA = 0;

  private keys = new Set<string>();
  private touch = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private tapItem = false;
  private lay = { ox: 0, oy: 0, u: 1 };
  private cleanup: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, pixelFont: string, base = "/kart/") {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.font = pixelFont;
    this.base = base;
    this.buf = document.createElement("canvas");
    this.buf.width = BW;
    this.buf.height = BH;
    this.bctx = this.buf.getContext("2d")!;
    this.bctx.imageSmoothingEnabled = false;
    this.frame = this.bctx.createImageData(BW, BH - HORIZON);
    this.frame32 = new Uint32Array(this.frame.data.buffer);
    this.touch = typeof window !== "undefined" && (window.location.search.includes("touch") || window.matchMedia("(pointer: coarse)").matches);
  }

  // ------------------------------------------------------------ start / stop
  start() {
    this.listen();
    this.load()
      .then(() => {
        this.ready = true;
        this.reset();
      })
      .catch((e) => {
        this.loadError = String(e);
      });
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.ready && !this.paused) {
        this.acc += dt;
        while (this.acc >= 1 / 60) {
          this.step(1 / 60);
          this.acc -= 1 / 60;
        }
      }
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
  }

  private loadImg(name: string) {
    return new Promise<void>((res, rej) => {
      const im = new Image();
      im.onload = () => {
        this.img[name] = im;
        res();
      };
      im.onerror = () => rej(`missing picture ${name}`);
      im.src = `${this.base}${name}.png`;
    });
  }

  private async load() {
    const names = ["track1-ground", "track1-map", "sky", "props", "itembox", ...Object.keys(CARS).flatMap((c) => VIEWS.map((v) => `kart-${c}-${v}`)), ...ITEMS.map((i) => `item-${i}`)];
    const [data] = await Promise.all([fetch(`${this.base}track1.json`).then((r) => r.json()), ...names.map((n) => this.loadImg(n))]);
    this.track = data as TrackData;
    const S = this.track.size;
    // the ground picture as raw pixels
    const GZ = this.img["track1-ground"].width;
    this.gsize = GZ;
    this.gs = GZ / S;
    const g = document.createElement("canvas");
    g.width = GZ;
    g.height = GZ;
    const gc = g.getContext("2d", { willReadFrequently: true })!;
    gc.drawImage(this.img["track1-ground"], 0, 0);
    this.ground = new Uint32Array(gc.getImageData(0, 0, GZ, GZ).data.buffer);
    // the surface map: 0 off-road, 1 road, 2 boost pad (half the size of the ground)
    const m = document.createElement("canvas");
    m.width = S / 2;
    m.height = S / 2;
    const mc = m.getContext("2d", { willReadFrequently: true })!;
    mc.drawImage(this.img["track1-map"], 0, 0);
    const md = mc.getImageData(0, 0, S / 2, S / 2).data;
    this.types = new Uint8Array((S / 2) * (S / 2));
    for (let i = 0; i < this.types.length; i++) this.types[i] = Math.round(md[i * 4] / 100);
    // minimap
    const MS = 96;
    this.mini = document.createElement("canvas");
    this.mini.width = MS;
    this.mini.height = MS;
    const nc = this.mini.getContext("2d")!;
    const nd = nc.createImageData(MS, MS);
    for (let y = 0; y < MS; y++)
      for (let x = 0; x < MS; x++) {
        const t = this.types[Math.floor(((y + 0.5) / MS) * (S / 2)) * (S / 2) + Math.floor(((x + 0.5) / MS) * (S / 2))];
        const o = (y * MS + x) * 4;
        if (t) {
          nd.data[o] = 236;
          nd.data[o + 1] = 230;
          nd.data[o + 2] = 255;
          nd.data[o + 3] = 230;
        }
      }
    nc.putImageData(nd, 0, 0);
    // kart colours
    this.kartSkins = [{ car: "mane", color: null }, ...BOTS].map((b) => {
      const set: Record<string, HTMLCanvasElement> = {};
      for (const v of VIEWS) set[v] = this.tint(this.img[`kart-${b.car}-${v}`], b.color as [number, number, number] | null);
      return set;
    });
    // the explosion: 6 clean frames side by side (a ball of fire that opens into a ring)
    const BF = 64;
    this.boom = document.createElement("canvas");
    this.boom.width = BF * 6;
    this.boom.height = BF;
    const bc = this.boom.getContext("2d")!;
    const cols = ["#ffffff", "#ffe23c", "#ff9628", "#ff46c8"];
    for (let f = 0; f < 6; f++) {
      const outer = 11 + f * 4;
      const inner = f < 2 ? 0 : f < 4 ? (f - 1) * 6 : outer - (7 - f) * 2; // the last two frames: just a thin ring
      for (let y = 0; y < BF; y++)
        for (let x = 0; x < BF; x++) {
          const ex = x - BF / 2 + 0.5, ey = y - BF / 2 + 0.5;
          const r = Math.hypot(ex, ey) + Math.sin(Math.atan2(ey, ex) * 8) * 1.7;
          if (r >= outer || r < inner) continue;
          bc.fillStyle = cols[Math.min(3, Math.floor(((r - inner) / (outer - inner)) * 4))];
          bc.fillRect(x, y, 1, 1);
        }
    }
  }

  // swap the pink in a kart picture for another colour (and tint the white body a little)
  private tint(src: HTMLImageElement, col: [number, number, number] | null) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext("2d")!;
    x.drawImage(src, 0, 0);
    if (!col) return c;
    const d = x.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      if (r > 190 && g < 130 && b > 130) {
        const f = r / 255;
        p[i] = col[0] * f;
        p[i + 1] = col[1] * f;
        p[i + 2] = col[2] * f;
      } else if (r > 195 && g > 190 && b > 220) {
        p[i] = r * 0.72 + col[0] * 0.28;
        p[i + 1] = g * 0.72 + col[1] * 0.28;
        p[i + 2] = b * 0.72 + col[2] * 0.28;
      }
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  // ------------------------------------------------------------ input
  private listen() {
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === "Enter") this.confirm();
      if (k === "Escape" || k === "p") if (this.state === "race" || this.state === "count") this.paused = !this.paused;
      if (k === " " || k === "x") this.tapItem = true;
      if (k === "r" && this.state === "race") this.rescue(this.me);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const pos = (e: PointerEvent) => {
      // where the finger is, in game pixels (0..480 across, 0..270 down)
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.canvas.width, py = ((e.clientY - r.top) / r.height) * this.canvas.height;
      return { x: (px - this.lay.ox) / this.lay.u, y: (py - this.lay.oy) / this.lay.u };
    };
    const pd = (e: PointerEvent) => {
      if (e.pointerType === "touch") this.touch = true;
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      if (this.state !== "race") this.confirm();
      else if (this.touch && p.x > UW / 2 && (p.y < 165 || p.x >= 350)) this.tapItem = true;
    };
    const pm = (e: PointerEvent) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos(e));
    };
    const pu = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    this.canvas.addEventListener("pointerdown", pd);
    this.canvas.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    window.addEventListener("pointercancel", pu);
    const blur = () => {
      this.keys.clear();
      this.pointers.clear();
    };
    window.addEventListener("blur", blur);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      this.canvas.removeEventListener("pointerdown", pd);
      this.canvas.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointercancel", pu);
      window.removeEventListener("blur", blur);
    });
  }

  private confirm() {
    if (!this.ready) return;
    if (this.paused) {
      this.paused = false;
      return;
    }
    if (this.state === "title") {
      this.state = "count";
      this.stateT = 0;
    } else if (this.state === "done" && this.stateT > 1.5) {
      this.reset();
      this.state = "count";
    }
  }

  // phone: the two arrows on the left steer, the right side is ITEM (top) and BRAKE (bottom)
  private touchSteer() {
    let s = 0;
    let brake = false;
    for (const p of this.pointers.values()) {
      if (p.x < 200 && p.y > 90) s += p.x < 79 ? -1 : 1;
      if (p.x >= UW / 2 && p.x < 350 && p.y >= 165) brake = true;
    }
    return { s: clamp(s, -1, 1), brake };
  }

  // ------------------------------------------------------------ race setup
  private reset() {
    const C = this.track.center;
    const N = C.length;
    this.karts = [];
    this.things = [];
    this.boxes = this.track.boxes.map(([x, y]) => ({ x, y, back: 0 }));
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 2);
      const idx = (N - 5 - row * 4 + N) % N;
      const [cx, cy] = C[idx];
      const [nx, ny] = C[(idx + 1) % N];
      const a = Math.atan2(ny - cy, nx - cx);
      const side = (i % 2 ? 1 : -1) * 16;
      const player = i === 5;
      this.karts.push({
        name: player ? "YOU" : BOTS[i].name,
        player,
        skin: player ? 0 : i + 1,
        car: player ? "mane" : BOTS[i].car,
        rev: -1,
        stall: 0,
        x: cx - Math.sin(a) * side,
        y: cy + Math.cos(a) * side,
        a,
        vx: 0,
        vy: 0,
        speed: 0,
        idx,
        total: idx - N,
        item: null,
        roulette: 0,
        useIn: 0,
        spin: 0,
        spinA: 0,
        boost: 0,
        blind: 0,
        safe: 0,
        off: 0,
        lane: (Math.random() * 2 - 1) * 0.45,
        skill: 0.86 + i * 0.028,
        finished: false,
        time: 0,
        place: i + 1,
        lost: 0,
      });
    }
    this.me = this.karts[5];
    this.camA = this.me.a;
    this.clock = 0;
    this.stateT = 0;
    this.state = "title";
    this.flash = "";
  }

  private typeAt(x: number, y: number) {
    const h = this.track.size / 2;
    const ix = x >> 1, iy = y >> 1;
    if (ix < 0 || iy < 0 || ix >= h || iy >= h) return 0;
    return this.types[iy * h + ix];
  }

  private rescue(k: Kart) {
    const C = this.track.center;
    const N = C.length;
    const [cx, cy] = C[k.idx];
    const [nx, ny] = C[(k.idx + 1) % N];
    k.x = cx;
    k.y = cy;
    k.a = Math.atan2(ny - cy, nx - cx);
    k.vx = k.vy = k.speed = 0;
    k.spin = 0;
    k.lost = 0;
    k.safe = 1.5;
  }

  // ------------------------------------------------------------ one step of the game
  private step(dt: number) {
    this.stateT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.state === "title") return;
    if (this.state === "count") {
      // revving: hold the gas during the countdown. From the 2 on = ROCKET START, earlier = TOO EARLY
      const me = this.me;
      const held = this.keys.has("ArrowUp") || this.keys.has("w") || (this.touch && this.pointers.size > 0);
      if (!held) me.rev = -1;
      else if (me.rev < 0) me.rev = this.stateT;
      if (this.stateT >= GO_TIME) {
        this.state = "race";
        this.stateT = 0;
        for (const k of this.karts) {
          if (!k.player) {
            const r = Math.random();
            k.rev = r < 0.3 ? 2 : r < 0.38 ? 0 : -1; // some bots get it right, a few choke
          }
          if (k.rev >= REV_FROM) k.boost = 1.3;
          else if (k.rev >= 0) k.stall = 1.2;
        }
        this.say(me.rev >= REV_FROM ? "ROCKET START!" : me.rev >= 0 ? "TOO EARLY!" : "GO!", 1.2);
        for (const k of this.karts) k.rev = -1;
      }
      return;
    }
    if (this.state === "race") this.clock += dt;
    const C = this.track.center;
    const N = C.length;

    for (const k of this.karts) {
      // ---- what the driver wants
      let steer = 0, gas = 0, brake = false;
      if (k.finished || !k.player) {
        const look = 9 + Math.floor(Math.abs(k.speed) / 22);
        const ti = (k.idx + look) % N;
        const [tx, ty] = C[ti];
        const [ux, uy] = C[(ti + 1) % N];
        const ta = Math.atan2(uy - ty, ux - tx);
        const w = Math.max(0, this.track.halfw[ti] - 20) * k.lane;
        const px = tx - Math.sin(ta) * w, py = ty + Math.cos(ta) * w;
        let want = wrapAngle(Math.atan2(py - k.y, px - k.x) - k.a);
        if (k.blind > 0) want += Math.sin(this.clock * 7 + k.skin) * 0.5;
        steer = clamp(want * 3, -1, 1);
        gas = Math.abs(want) > 0.7 ? 0.55 : 1;
        if (Math.random() < 0.004) k.lane = (Math.random() * 2 - 1) * 0.45;
      } else {
        const t = this.touchSteer();
        if (this.keys.has("ArrowLeft") || this.keys.has("a")) steer -= 1;
        if (this.keys.has("ArrowRight") || this.keys.has("d")) steer += 1;
        steer = clamp(steer + t.s, -1, 1);
        brake = this.keys.has("ArrowDown") || this.keys.has("s") || t.brake;
        gas = this.keys.has("ArrowUp") || this.keys.has("w") || (this.touch && !brake) ? 1 : 0;
      }

      // ---- timers
      if (k.stall > 0) {
        k.stall -= dt;
        gas = 0;
        brake = false;
      }
      if (k.boost > 0) k.boost -= dt;
      if (k.blind > 0) k.blind -= dt;
      if (k.safe > 0) k.safe -= dt;
      const type = this.typeAt(k.x, k.y);
      if (type === 2 && k.boost < 0.9) k.boost = 1.1;

      // ---- speed
      let top = MAX_SPEED * (k.player ? 1 : k.skill);
      if (!k.player && !k.finished) {
        const gap = k.total - this.me.total;
        if (gap > 55) top *= 0.9;
        if (gap < -55) top *= 1.07;
        if (k.blind > 0) top *= 0.8;
      }
      if (type === 0) top *= 0.42;
      if (k.boost > 0) top = MAX_SPEED * 1.5;
      if (k.spin > 0) {
        // a spin-out: exactly two full turns, fast at first and easing out, so it always ends facing forward
        k.spin -= dt;
        const p = 1 - Math.max(0, k.spin) / SPIN_TIME;
        k.spinA = Math.PI * 4 * (1 - (1 - p) * (1 - p));
        k.speed *= 0.96;
        if (k.spin <= 0) k.spinA = 0;
      } else {
        if (brake) k.speed -= (k.speed > 0 ? 330 : 120) * dt;
        else if (gas) k.speed += (top - k.speed) * (k.boost > 0 ? 3.2 : k.speed > top ? 2.4 : 1.25) * gas * dt + 18 * dt;
        else k.speed -= k.speed * 0.9 * dt;
        if (!brake && k.speed > top) k.speed -= (k.speed - top) * 2.5 * dt;
        k.speed = clamp(k.speed, -80, MAX_SPEED * 1.6);
        const grip = clamp(k.speed / 80, -1, 1);
        k.a += steer * (2.5 - 0.7 * Math.min(1, Math.abs(k.speed) / MAX_SPEED)) * grip * dt;
      }
      // a little slide: the kart keeps some of where it was going
      const wx = Math.cos(k.a) * k.speed, wy = Math.sin(k.a) * k.speed;
      const g = Math.min(1, 9 * dt);
      k.vx += (wx - k.vx) * g;
      k.vy += (wy - k.vy) * g;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      const S = this.track.size;
      if (k.x < 12 || k.y < 12 || k.x > S - 12 || k.y > S - 12) {
        k.x = clamp(k.x, 12, S - 12);
        k.y = clamp(k.y, 12, S - 12);
        k.speed *= 0.5;
      }

      // ---- where on the lap
      let best = k.idx, bd = 1e18;
      for (let o = -12; o <= 26; o++) {
        const i = (k.idx + o + N) % N;
        const dx = C[i][0] - k.x, dy = C[i][1] - k.y;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      let delta = best - k.idx;
      if (delta > N / 2) delta -= N;
      if (delta < -N / 2) delta += N;
      k.idx = best;
      k.total += delta;
      k.off = Math.sqrt(bd);
      // lost far away from the road (or a stuck bot): put back
      k.lost = k.off > this.track.halfw[k.idx] + 150 || (!k.player && Math.abs(k.speed) < 25 && k.spin <= 0) ? k.lost + dt : 0;
      if (k.lost > (k.player ? 3 : 2.5)) this.rescue(k);

      if (!k.finished && k.total >= N * LAPS) {
        k.finished = true;
        k.time = this.clock;
        k.place = this.karts.filter((o) => o.finished).length;
        if (k.player) {
          this.state = "done";
          this.stateT = 0;
        }
      } else if (k.player && !k.finished && delta > 0 && k.total >= N * (LAPS - 1) && k.total - delta < N * (LAPS - 1)) this.say("FINAL LAP", 2);

      // ---- item boxes
      if (k.roulette > 0) {
        k.roulette -= dt;
        if (k.roulette <= 0) {
          const first = this.rank(k) === 1;
          const pool: ItemName[] = first ? ["vinyl", "wall", "bolt", "bomb", "vinyl"] : ["bolt", "bomb", "vinyl", "mic", "bass", "mute", "wall", "bolt", "mic"];
          k.item = pool[Math.floor(Math.random() * pool.length)];
          k.useIn = 1 + Math.random() * 3.5;
        }
      } else if (!k.item && !k.finished) {
        for (const b of this.boxes)
          if (b.back <= 0 && Math.abs(b.x - k.x) < 15 && Math.abs(b.y - k.y) < 15) {
            b.back = 2.5;
            k.roulette = 0.9;
          }
      }
      if (k.item && k.spin <= 0) {
        if (k.player && !k.finished) {
          if (this.tapItem) this.useItem(k);
        } else {
          k.useIn -= dt;
          if (k.useIn <= 0) this.useItem(k);
        }
      }
    }
    this.tapItem = false;
    for (const b of this.boxes) if (b.back > 0) b.back -= dt;

    // ---- karts bump each other
    for (let i = 0; i < this.karts.length; i++)
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i], b = this.karts[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 15 && d > 0.01) {
          const push = (15 - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }

    this.stepThings(dt);

    // places
    const order = [...this.karts].sort((a, b) => (a.finished !== b.finished ? (a.finished ? -1 : 1) : a.finished ? a.time - b.time : b.total - a.total));
    order.forEach((k, i) => (k.place = i + 1));
  }

  private rank(k: Kart) {
    return this.karts.filter((o) => o.total > k.total).length + 1;
  }

  private say(text: string, secs: number) {
    this.flash = text;
    this.flashT = secs;
  }

  private hit(k: Kart, secs: number) {
    if (k.safe > 0 || k.finished) return;
    k.spin = SPIN_TIME;
    k.spinA = 0;
    k.boost = 0;
    k.safe = SPIN_TIME + secs;
    if (k.player) this.say("OUCH", 0.8);
  }

  private useItem(k: Kart) {
    const it = k.item!;
    k.item = null;
    const dx = Math.cos(k.a), dy = Math.sin(k.a);
    const add = (kind: Thing["kind"], x: number, y: number, vx: number, vy: number, life: number) =>
      this.things.push({ kind, x, y, vx, vy, z: 0, t: 0, life, owner: k, idx: k.idx });
    if (it === "bolt") k.boost = 1.7;
    if (it === "bomb") add("bomb", k.x + dx * 12, k.y + dy * 12, dx * (Math.max(0, k.speed) + 230), dy * (Math.max(0, k.speed) + 230), 0.8);
    if (it === "vinyl") add("vinyl", k.x - dx * 20, k.y - dy * 20, 0, 0, 30);
    if (it === "wall") add("wall", k.x - dx * 24, k.y - dy * 24, 0, 0, 10);
    if (it === "mic") add("mic", k.x + dx * 14, k.y + dy * 14, dx, dy, 7);
    if (it === "bass") {
      add("wave", k.x, k.y, 0, 0, 0.5);
      for (const o of this.karts) if (o !== k && Math.hypot(o.x - k.x, o.y - k.y) < 150) this.hit(o, 1.1);
    }
    if (it === "mute") {
      for (const o of this.karts) if (o !== k && !o.finished) o.blind = 3.5;
      if (!k.player) this.say("MUTED!", 1.2);
    }
  }

  private stepThings(dt: number) {
    const C = this.track.center;
    const N = C.length;
    for (const t of this.things) {
      t.t += dt;
      if (t.kind === "bomb") {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.z = Math.sin((t.t / t.life) * Math.PI) * 26;
        if (t.t >= t.life) {
          t.kind = "boom";
          t.t = 0;
          t.life = 0.42;
          t.z = 0;
          for (const k of this.karts) if (Math.hypot(k.x - t.x, k.y - t.y) < 46) this.hit(k, 1.3);
        }
      } else if (t.kind === "mic") {
        // chase the kart in front, along the road
        let target: Kart | null = null;
        for (const k of this.karts)
          if (k !== t.owner && !k.finished && k.total > t.owner.total - 6 && (!target || k.total < target.total)) target = k;
        let tx: number, ty: number;
        if (target && Math.hypot(target.x - t.x, target.y - t.y) < 170) {
          tx = target.x;
          ty = target.y;
        } else {
          let best = t.idx, bd = 1e18;
          for (let o = 0; o <= 20; o++) {
            const i = (t.idx + o) % N;
            const d = (C[i][0] - t.x) ** 2 + (C[i][1] - t.y) ** 2;
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          t.idx = best;
          [tx, ty] = C[(best + 8) % N];
        }
        const a = Math.atan2(ty - t.y, tx - t.x);
        t.vx = Math.cos(a);
        t.vy = Math.sin(a);
        t.x += t.vx * 430 * dt;
        t.y += t.vy * 430 * dt;
        for (const k of this.karts)
          if (k !== t.owner && Math.hypot(k.x - t.x, k.y - t.y) < 15) {
            this.hit(k, 1.2);
            t.t = t.life;
            break;
          }
      } else if (t.kind === "vinyl") {
        for (const k of this.karts)
          if ((k !== t.owner || t.t > 1) && Math.hypot(k.x - t.x, k.y - t.y) < 14) {
            if (k.safe <= 0) {
              this.hit(k, 1.2);
              t.t = t.life;
            }
            break;
          }
      } else if (t.kind === "wall") {
        for (const k of this.karts) {
          const dx = k.x - t.x, dy = k.y - t.y;
          const d = Math.hypot(dx, dy);
          if ((k !== t.owner || t.t > 1) && d < 22 && d > 0.01) {
            k.x = t.x + (dx / d) * 23;
            k.y = t.y + (dy / d) * 23;
            k.speed = -Math.abs(k.speed) * 0.35;
            k.vx = (dx / d) * 60;
            k.vy = (dy / d) * 60;
            k.boost = 0;
          }
        }
      }
    }
    this.things = this.things.filter((t) => t.t < t.life);
  }

  // ------------------------------------------------------------ drawing
  private draw() {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = this.ctx;
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);
    const u = Math.min(w / UW, h / UH);
    const ox = Math.round((w - UW * u) / 2), oy = Math.round((h - UH * u) / 2);
    this.lay = { ox, oy, u };
    const text = (s: string, x: number, y: number, size: number, col = "#fff", align: CanvasTextAlign = "left") => {
      ctx.font = `${Math.round(size * u)}px ${this.font}, monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#12041c";
      ctx.fillText(s, ox + (x + size * 0.14) * u, oy + (y + size * 0.14) * u);
      ctx.fillStyle = col;
      ctx.fillText(s, ox + x * u, oy + y * u);
    };
    if (!this.ready) {
      text(this.loadError ? "COULD NOT LOAD THE GAME" : "LOADING...", UW / 2, UH / 2 - 6, 12, "#ff46c8", "center");
      if (this.loadError) text(this.loadError.slice(0, 50), UW / 2, UH / 2 + 14, 6, "#fff", "center");
      return;
    }
    this.drawWorld();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, ox, oy, UW * u, UH * u);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, UW * u, UH * u);
    ctx.clip();
    const me = this.me;
    const pic = (im: Img, x: number, y: number, s: number, sx = 0, sw = im.width) => ctx.drawImage(im, sx, 0, sw, im.height, ox + x * u, oy + y * u, sw * s * u, im.height * s * u);

    // blinded by MUTE
    if (me.blind > 0 && this.state === "race") {
      ctx.fillStyle = `rgba(18,4,28,${Math.min(0.5, me.blind)})`;
      ctx.fillRect(ox, oy, UW * u, UH * u);
      const eye = this.img["item-mute"];
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) {
        const s = 1.8 + (i % 3) * 0.7;
        pic(eye, 40 + ((i * 83 + this.clock * 30) % 420) - 24 * s, 34 + ((i * 59) % 150) + Math.sin(this.clock * 3 + i) * 10, s);
      }
      ctx.globalAlpha = 1;
    }
    // speed lines
    if (me.boost > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + this.clock * 9;
        const r1 = 150 + ((i * 37 + this.clock * 400) % 60), r2 = r1 + 40;
        const cx = UW / 2, cy = UH * 0.62;
        ctx.beginPath();
        ctx.moveTo(ox + (cx + Math.cos(a) * r1) * u, oy + (cy + Math.sin(a) * r1 * 0.6) * u);
        ctx.lineTo(ox + (cx + Math.cos(a) * r2) * u, oy + (cy + Math.sin(a) * r2 * 0.6) * u);
        ctx.lineTo(ox + (cx + Math.cos(a + 0.02) * r2) * u, oy + (cy + Math.sin(a + 0.02) * r2 * 0.6) * u);
        ctx.fill();
      }
    }

    if (this.state === "race" || this.state === "count" || this.state === "done") {
      const N = this.track.center.length;
      const lap = clamp(Math.floor(me.total / N) + 1, 1, LAPS);
      text(`LAP ${lap}/${LAPS}`, 8, 8, 9, "#fff");
      text(fmtTime(this.clock), UW - 8, 8, 9, "#fff", "right");
      text(PLACE[me.place - 1], 8, UH - 34, 22, me.place === 1 ? "#ffe23c" : "#ff46c8");
      text(`/${this.karts.length}`, 8 + 22 * 3.1, UH - 20, 8, "#fff");
      // item slot
      const bx = UW / 2 - 17, by = 6;
      ctx.fillStyle = "rgba(18,4,28,0.75)";
      ctx.fillRect(ox + bx * u, oy + by * u, 34 * u, 34 * u);
      ctx.strokeStyle = "#ff46c8";
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(ox + bx * u, oy + by * u, 34 * u, 34 * u);
      const show: ItemName | null = me.roulette > 0 ? ITEMS[Math.floor(this.clock * 14) % ITEMS.length] : me.item;
      if (show) {
        pic(this.img[`item-${show}`], bx + 1, by + 1, 32 / 48);
        if (me.item) text(ITEM_LABEL[me.item], UW / 2, by + 38, 6, "#ffe23c", "center");
      }
      // minimap
      const mx = UW - 78, my = UH - 78, ms = 70 / 96;
      ctx.globalAlpha = 0.85;
      pic(this.mini, mx, my, ms);
      ctx.globalAlpha = 1;
      const S = this.track.size;
      for (const k of [...this.karts].sort((a) => (a.player ? 1 : -1))) {
        const c = k.player ? [255, 70, 200] : BOTS[k.skin - 1].color;
        const r = k.player ? 3 : 2;
        ctx.fillStyle = "#12041c";
        ctx.fillRect(ox + (mx + (k.x / S) * 70 - r - 0.6) * u, oy + (my + (k.y / S) * 70 - r - 0.6) * u, (r * 2 + 1.2) * u, (r * 2 + 1.2) * u);
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(ox + (mx + (k.x / S) * 70 - r) * u, oy + (my + (k.y / S) * 70 - r) * u, r * 2 * u, r * 2 * u);
      }
      // phone buttons
      if (this.touch && this.state !== "done") {
        const btn = (label: string, x: number, y: number, bw: number, bh: number, on: boolean) => {
          ctx.fillStyle = on ? "rgba(255,70,200,0.55)" : "rgba(18,4,28,0.45)";
          ctx.fillRect(ox + x * u, oy + y * u, bw * u, bh * u);
          ctx.strokeStyle = "#ece6ff";
          ctx.strokeRect(ox + x * u, oy + y * u, bw * u, bh * u);
          text(label, x + bw / 2, y + bh / 2 - 5, 10, "#fff", "center");
        };
        const t = this.touchSteer();
        btn("<", 6, UH - 96, 70, 50, t.s < 0);
        btn(">", 82, UH - 96, 70, 50, t.s > 0);
        btn("BRAKE", UW - 196, UH - 92, 62, 40, t.brake);
        btn("ITEM", UW - 128, UH - 132, 46, 40, false);
      }
    }
    if (this.state === "count") {
      const n = 3 - Math.floor(this.stateT);
      if (n >= 1) text(String(n), UW / 2, 62, 48, "#ffe23c", "center");
      // the rev bar: fills up while you hold the gas (red = pressed too early)
      const bw = 90, bx2 = UW / 2 - bw / 2, by2 = 122;
      ctx.fillStyle = "rgba(18,4,28,0.75)";
      ctx.fillRect(ox + (bx2 - 2) * u, oy + (by2 - 2) * u, (bw + 4) * u, 12 * u);
      if (me.rev >= 0) {
        const fill = clamp((this.stateT - me.rev) / Math.max(0.2, GO_TIME - me.rev), 0, 1);
        ctx.fillStyle = me.rev < REV_FROM ? "#ff3b3b" : "#ffe23c";
        ctx.fillRect(ox + bx2 * u, oy + by2 * u, bw * fill * u, 8 * u);
      }
      text(this.touch ? "HOLD THE SCREEN ON 2" : "HOLD W / UP ON 2", UW / 2, by2 + 14, 6, "#fff", "center");
    }
    if (this.flashT > 0 && this.state === "race") text(this.flash, UW / 2, 74, 22, "#ffe23c", "center");
    if (this.state === "race" && me.lost > 1) text("WRONG WAY? PRESS R", UW / 2, 120, 8, "#fff", "center");

    if (this.state === "title") {
      ctx.fillStyle = "rgba(10,3,18,0.62)";
      ctx.fillRect(ox, oy, UW * u, UH * u);
      text("PINK KART", UW / 2, 44, 34, "#ff46c8", "center");
      text("DEMO - TRACK 1", UW / 2, 88, 10, "#ffe23c", "center");
      ITEMS.forEach((it, i) => pic(this.img[`item-${it}`], UW / 2 - 7 * 19 + i * 38 + 3, 112, 32 / 48));
      if (this.touch) {
        text("LEFT THUMB: STEER   RIGHT: ITEM / BRAKE", UW / 2, 160, 7, "#fff", "center");
        text("THE KART DRIVES BY ITSELF", UW / 2, 174, 7, "#fff", "center");
        text("HOLD THE SCREEN WHEN 2 SHOWS = ROCKET START", UW / 2, 188, 7, "#ffe23c", "center");
        if (Math.floor(this.stateT * 2) % 2 === 0) text("TAP TO RACE", UW / 2, 214, 14, "#fff", "center");
      } else {
        text("ARROWS OR WASD: DRIVE     SPACE: USE ITEM", UW / 2, 160, 7, "#fff", "center");
        text("R: BACK ON THE ROAD     ESC: PAUSE", UW / 2, 174, 7, "#fff", "center");
        text("HOLD W / UP WHEN 2 SHOWS = ROCKET START", UW / 2, 188, 7, "#ffe23c", "center");
        if (Math.floor(this.stateT * 2) % 2 === 0) text("PRESS ENTER", UW / 2, 214, 14, "#fff", "center");
      }
    }
    if (this.state === "done") {
      ctx.fillStyle = `rgba(10,3,18,${Math.min(0.72, this.stateT)})`;
      ctx.fillRect(ox, oy, UW * u, UH * u);
      const order = [...this.karts].sort((a, b) => a.place - b.place);
      text(me.place === 1 ? "YOU WIN!" : `YOU FINISHED ${PLACE[me.place - 1]}`, UW / 2, 30, 20, "#ffe23c", "center");
      order.forEach((k, i) => {
        const col = k.player ? "#ff46c8" : "#fff";
        text(PLACE[i], 130, 74 + i * 22, 10, col);
        text(k.name, 190, 74 + i * 22, 10, col);
        text(k.finished ? fmtTime(k.time) : "...", 350, 74 + i * 22, 10, col, "right");
      });
      if (this.stateT > 1.5 && Math.floor(this.stateT * 2) % 2 === 0) text(this.touch ? "TAP TO RACE AGAIN" : "ENTER: RACE AGAIN", UW / 2, 226, 10, "#fff", "center");
    }
    if (this.paused) {
      ctx.fillStyle = "rgba(10,3,18,0.7)";
      ctx.fillRect(ox, oy, UW * u, UH * u);
      text("PAUSED", UW / 2, 110, 22, "#ff46c8", "center");
      text("ESC OR ENTER TO GO ON", UW / 2, 146, 8, "#fff", "center");
    }
    ctx.restore();
  }

  private drawWorld() {
    const me = this.me;
    const b = this.bctx;
    // the camera swings smoothly behind the kart (on the title screen it circles)
    const wantA = this.state === "title" ? me.a + Math.sin(this.stateT * 0.5) * 0.5 : me.a;
    this.camA += wrapAngle(wantA - this.camA) * 0.14;
    const ca = this.camA;
    const dx = Math.cos(ca), dy = Math.sin(ca);
    const rx = -dy, ry = dx;
    const camX = me.x - dx * CAM_BACK, camY = me.y - dy * CAM_BACK;

    // ---- sky: sky.png is one full turn, so it wraps around exactly once (one sun)
    const sky = this.img["sky"];
    let off = (((ca / (Math.PI * 2)) * sky.width) % sky.width + sky.width) % sky.width;
    off = Math.round(off);
    const skyY = HORIZON + 4 - sky.height;
    b.fillStyle = "#100628";
    b.fillRect(0, 0, BW, HORIZON);
    b.drawImage(sky, -off, skyY);
    b.drawImage(sky, sky.width - off, skyY);

    // ---- ground
    const S = this.gsize;
    const gs = this.gs;
    const out = this.frame32;
    const G = this.ground;
    const rows = BH - HORIZON;
    const types = this.types, TH = this.track.size / 2;
    const mask = this.mask, seed = this.seedMap;
    const FOG_R = 235, FOG_G = 50, FOG_B = 170; // far away the ground fades into the pink haze
    for (let r = 0; r < rows; r++) {
      const z = (CAM_H * FOCAL) / (r + 0.5);
      const stepX = (rx * z) / FOCAL, stepY = (ry * z) / FOCAL;
      let wx = camX + dx * z - stepX * (BW / 2), wy = camY + dy * z - stepY * (BW / 2);
      const fog = z > 500 ? Math.min(0.85, (z - 500) / 2600) : 0;
      const f256 = (fog * 256) | 0, inv = 256 - f256;
      let o = r * BW;
      for (let x = 0; x < BW; x++, o++) {
        const ix = (wx * gs) | 0, iy = (wy * gs) | 0;
        let c: number;
        let field = 1;
        if (ix >= 0 && iy >= 0 && ix < S && iy < S) {
          c = G[iy * S + ix];
          if (types[(iy >> 1) * TH + (ix >> 1)]) field = 0;
        } else c = ((ix % 96) + 96) % 96 < 3 || ((iy % 96) + 96) % 96 < 3 ? 0xff4a103a : 0xff200914; // past the map: more dark field
        if (f256) {
          const cr = ((c & 255) * inv + FOG_R * f256) >> 8;
          const cg = (((c >> 8) & 255) * inv + FOG_G * f256) >> 8;
          const cb = (((c >> 16) & 255) * inv + FOG_B * f256) >> 8;
          c = 0xff000000 | (cb << 16) | (cg << 8) | cr;
        }
        out[o] = c;
        mask[o] = field;
        seed[o] = ((ix >> 2) * 7 + (iy >> 2) * 13) & 255; // which clump of grass this spot belongs to
        wx += stepX;
        wy += stepY;
      }
    }
    // ---- THE FIELD SITS HIGHER THAN THE ROAD: wherever field meets road, a fringe of dark grass with pink tips
    // stands up along the edge and sways. (Far edges also get a little dark bank under the grass.)
    const sway = performance.now() / 1000;
    for (let r = 2; r < rows; r++) {
      const z = (CAM_H * FOCAL) / (r + 0.5);
      if (z > 620) continue; // too far away to see blades
      const tall = (GRASS_TALL * FOCAL) / z; // how tall a blade is on screen at this distance
      const row = r * BW;
      for (let x = 0; x < BW; x++) {
        const o = row + x;
        const here = mask[o], above = mask[o - BW];
        if (here === above) continue;
        // the field pixel right at the edge decides how its clump looks
        const sd = here ? seed[o] : seed[o - BW];
        const wave = 0.75 + 0.25 * Math.sin(sway * 4 + sd * 0.7 + x * 0.05);
        const h = Math.max(1, Math.round(tall * (0.45 + (sd & 7) / 9) * wave));
        if (!here) {
          // field behind the road: a dark bank facing you, grass on top of it
          const bank = Math.max(1, Math.round(tall * 0.35));
          for (let k = 0; k < bank && r + k < rows; k++) out[o + k * BW] = GRASS_BANK;
        }
        for (let k = 1; k <= h && r - k >= 0; k++) out[o - k * BW] = k >= h ? GRASS_TIP : k >= h - 1 && h > 3 ? GRASS_MID : GRASS_DARK;
      }
    }
    b.putImageData(this.frame, 0, HORIZON);

    // ---- BASS DROP: a ring of dots racing outwards over the ground
    for (const t of this.things) {
      if (t.kind !== "wave") continue;
      const g = t.t / t.life;
      const rad = 150 * (1 - (1 - g) * (1 - g));
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const ex = t.x + Math.cos(a) * rad - camX, ey = t.y + Math.sin(a) * rad - camY;
        const z = ex * dx + ey * dy;
        if (z < 12) continue;
        const sc = FOCAL / z;
        const size = Math.max(1, Math.round(5 * sc * (1 - g * 0.5)));
        b.fillStyle = i % 2 ? "#ff46c8" : "#ffffff";
        b.fillRect(Math.round(BW / 2 + (ex * rx + ey * ry) * sc - size / 2), Math.round(HORIZON + CAM_H * sc - size), size, size);
      }
    }

    // ---- everything standing on the ground
    const list: Sprite[] = [];
    const now = performance.now();
    for (const k of this.karts) {
      let rel = wrapAngle(k.a + k.spinA - ca);
      if (k === me && k.spin <= 0) rel = 0;
      // which side of the car we see: back, right side, front, left side
      const quarter = Math.round(rel / (Math.PI / 2));
      const view = quarter === 0 ? "back" : Math.abs(quarter) === 2 ? "front" : "side";
      const im = this.kartSkins[k.skin][view];
      const fw = im.width / 3;
      // flames only while boosting, or while revving on the start line
      const fire = k.boost > 0 || (this.state === "count" && k.rev >= 0);
      const frame = fire ? 1 + (Math.floor(now / 50) % 2) : 0;
      // spinning out: each side squeezes thin and opens into the next one, like a turning card, with a little hop
      const spinning = k.spin > 0;
      const squash = spinning ? Math.max(0.12, Math.cos((rel - (quarter * Math.PI) / 2) * 2)) : 1;
      const hop = spinning ? Math.sin((1 - k.spin / SPIN_TIME) * Math.PI) * 9 : 0;
      const shake = k.stall > 0 || (this.state === "count" && k.rev >= 0) ? (Math.floor(now / 40) % 2) * 0.5 : 0;
      list.push({ img: im, sx: frame * fw, sw: fw, sh: im.height, x: k.x, y: k.y, k: CARS[k.car].k, lift: hop + shake, flip: view === "side" && rel < 0, shadow: true, squash });
    }
    for (const bx of this.boxes)
      if (bx.back <= 0) {
        const im = this.img["itembox"];
        list.push({ img: im, sx: (Math.floor(now / 250) % 2) * 28, sw: 28, sh: 28, x: bx.x, y: bx.y, k: 0.55, lift: 5 + Math.sin(now / 300 + bx.x) * 2, flip: false, shadow: true });
      }
    // beside the track: the black sigil trees (pictures 0-2 in props.png) and black weed plants (3-5), about half and half
    for (const p of this.track.props) list.push({ img: this.img["props"], sx: (p[2] + ((p[0] + p[1]) % 2) * 3) * 40, sw: 40, sh: 64, x: p[0], y: p[1], k: 1.1, lift: 0, flip: false, shadow: false });
    for (const t of this.things) {
      if (t.kind === "wave") continue;
      if (t.kind === "boom") {
        // the blast: 6 frames, always the same size, sitting on the ground
        const f = Math.min(5, Math.floor((t.t / t.life) * 6));
        list.push({ img: this.boom, sx: f * 64, sw: 64, sh: 64, x: t.x, y: t.y, k: 1.08, lift: -12, flip: false, shadow: false });
      } else {
        const name = t.kind === "bomb" ? "item-bomb" : t.kind === "mic" ? "item-mic" : t.kind === "vinyl" ? "item-vinyl" : "item-wall";
        list.push({ img: this.img[name], sx: 0, sw: 48, sh: 48, x: t.x, y: t.y, k: t.kind === "wall" ? 0.95 : 0.42, lift: t.z + (t.kind === "mic" ? 4 : 0), flip: false, shadow: t.kind !== "wall" });
      }
    }
    const proj: { s: Sprite; z: number; px: number; py: number; sc: number }[] = [];
    for (const s of list) {
      const ex = s.x - camX, ey = s.y - camY;
      const z = ex * dx + ey * dy;
      if (z < 12 || z > 1500) continue;
      const side = ex * rx + ey * ry;
      const sc = FOCAL / z;
      const px = BW / 2 + side * sc;
      if (px < -200 || px > BW + 200) continue;
      proj.push({ s, z, px, py: HORIZON + CAM_H * sc, sc });
    }
    proj.sort((a, c) => c.z - a.z);
    for (const p of proj) {
      const s = p.s;
      const fullW = s.sw * s.k * p.sc;
      const w = fullW * (s.squash ?? 1), h = s.sh * s.k * p.sc;
      if (fullW < 1.5) continue;
      const x = Math.round(p.px - w / 2), y = Math.round(p.py - h - s.lift * p.sc);
      if (s.shadow) {
        b.fillStyle = "rgba(10,2,16,0.4)";
        b.fillRect(Math.round(p.px - fullW * 0.42), Math.round(p.py - Math.max(1, h * 0.05)), Math.round(fullW * 0.84), Math.max(1, Math.round(h * 0.1)));
      }
      if (p.z > 500) b.globalAlpha = Math.max(0.25, 1 - (p.z - 500) / 1300);
      if (s.flip) {
        b.save();
        b.translate(x + Math.round(w), y);
        b.scale(-1, 1);
        b.drawImage(s.img, s.sx, 0, s.sw, s.sh, 0, 0, Math.round(w), Math.round(h));
        b.restore();
      } else b.drawImage(s.img, s.sx, 0, s.sw, s.sh, x, y, Math.round(w), Math.round(h));
      b.globalAlpha = 1;
    }
  }
}
