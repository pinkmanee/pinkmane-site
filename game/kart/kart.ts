// PINK KART (demo): a behind-the-kart racing game drawn on a small pixel screen and blown up.
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

const BW = 480; // the small pixel screen
const BH = 270;
const HORIZON = 100;
const FOCAL = 260;
const CAM_H = 34;
const CAM_BACK = 65; // with KART_SCALE 0.25 your own kart is drawn at exactly its drawn size
const LAPS = 3;
const KART_SCALE = 0.25; // world units per sprite pixel
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
const BOT_COLORS: [number, number, number][] = [
  [60, 220, 255],
  [150, 255, 80],
  [255, 150, 40],
  [150, 100, 255],
  [255, 70, 90],
];
const BOT_NAMES = ["808", "SERUM", "VOID", "HEX", "KONG"];

type Kart = {
  name: string;
  player: boolean;
  skin: number;
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
type Sprite = { img: Img; sx: number; sw: number; sh: number; x: number; y: number; k: number; lift: number; flip: boolean; shadow: boolean };

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
    const names = ["track1-ground", "track1-map", "sky", "props", "itembox", "kart-back", "kart-side", "kart-front", "kart-top", ...ITEMS.map((i) => `item-${i}`)];
    const [data] = await Promise.all([fetch(`${this.base}track1.json`).then((r) => r.json()), ...names.map((n) => this.loadImg(n))]);
    this.track = data as TrackData;
    const S = this.track.size;
    // the ground picture as raw pixels
    const g = document.createElement("canvas");
    g.width = S;
    g.height = S;
    const gc = g.getContext("2d", { willReadFrequently: true })!;
    gc.drawImage(this.img["track1-ground"], 0, 0);
    this.ground = new Uint32Array(gc.getImageData(0, 0, S, S).data.buffer);
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
    const views = ["back", "side", "front", "top"];
    this.kartSkins = [null, ...BOT_COLORS].map((col) => {
      const set: Record<string, HTMLCanvasElement> = {};
      for (const v of views) set[v] = this.tint(this.img[`kart-${v}`], col as [number, number, number] | null);
      return set;
    });
    // explosion picture
    this.boom = document.createElement("canvas");
    this.boom.width = 64;
    this.boom.height = 64;
    const bc = this.boom.getContext("2d")!;
    const cols = ["#ff46c8", "#ff9628", "#ffe23c", "#ffffff"];
    for (let i = 0; i < 4; i++) {
      bc.fillStyle = cols[i];
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const r = Math.hypot(x - 31.5, y - 31.5) + Math.sin(Math.atan2(y - 31.5, x - 31.5) * 9) * 3;
          if (r < 30 - i * 7) bc.fillRect(x, y, 1, 1);
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
      else if (this.touch && p.x > BW / 2 && (p.y < 165 || p.x >= 350)) this.tapItem = true;
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
      if (p.x >= BW / 2 && p.x < 350 && p.y >= 165) brake = true;
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
        name: player ? "YOU" : BOT_NAMES[i],
        player,
        skin: player ? 0 : i + 1,
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
      if (this.stateT >= 3.2) {
        this.state = "race";
        this.stateT = 0;
        this.say("GO!", 1);
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
        k.spin -= dt;
        k.spinA += dt * 14;
        k.speed *= 0.955;
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
    k.spin = secs;
    k.boost = 0;
    k.safe = secs + 1;
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
      add("wave", k.x, k.y, 0, 0, 0.6);
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
          t.life = 0.5;
          t.z = 0;
          for (const k of this.karts) if (Math.hypot(k.x - t.x, k.y - t.y) < 62) this.hit(k, 1.3);
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
    const u = Math.min(w / BW, h / BH);
    const ox = Math.round((w - BW * u) / 2), oy = Math.round((h - BH * u) / 2);
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
      text(this.loadError ? "COULD NOT LOAD THE GAME" : "LOADING...", BW / 2, BH / 2 - 6, 12, "#ff46c8", "center");
      if (this.loadError) text(this.loadError.slice(0, 50), BW / 2, BH / 2 + 14, 6, "#fff", "center");
      return;
    }
    this.drawWorld();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, ox, oy, BW * u, BH * u);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, BW * u, BH * u);
    ctx.clip();
    const me = this.me;
    const pic = (im: Img, x: number, y: number, s: number, sx = 0, sw = im.width) => ctx.drawImage(im, sx, 0, sw, im.height, ox + x * u, oy + y * u, sw * s * u, im.height * s * u);

    // blinded by MUTE
    if (me.blind > 0 && this.state === "race") {
      ctx.fillStyle = `rgba(18,4,28,${Math.min(0.5, me.blind)})`;
      ctx.fillRect(ox, oy, BW * u, BH * u);
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
        const cx = BW / 2, cy = BH * 0.62;
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
      text(fmtTime(this.clock), BW - 8, 8, 9, "#fff", "right");
      text(PLACE[me.place - 1], 8, BH - 34, 22, me.place === 1 ? "#ffe23c" : "#ff46c8");
      text(`/${this.karts.length}`, 8 + 22 * 3.1, BH - 20, 8, "#fff");
      // item slot
      const bx = BW / 2 - 17, by = 6;
      ctx.fillStyle = "rgba(18,4,28,0.75)";
      ctx.fillRect(ox + bx * u, oy + by * u, 34 * u, 34 * u);
      ctx.strokeStyle = "#ff46c8";
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(ox + bx * u, oy + by * u, 34 * u, 34 * u);
      const show: ItemName | null = me.roulette > 0 ? ITEMS[Math.floor(this.clock * 14) % ITEMS.length] : me.item;
      if (show) {
        pic(this.img[`item-${show}`], bx + 1, by + 1, 32 / 48);
        if (me.item) text(ITEM_LABEL[me.item], BW / 2, by + 38, 6, "#ffe23c", "center");
      }
      // minimap
      const mx = BW - 78, my = BH - 78, ms = 70 / 96;
      ctx.globalAlpha = 0.85;
      pic(this.mini, mx, my, ms);
      ctx.globalAlpha = 1;
      const S = this.track.size;
      for (const k of [...this.karts].sort((a) => (a.player ? 1 : -1))) {
        const c = k.player ? [255, 70, 200] : BOT_COLORS[k.skin - 1];
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
        btn("<", 6, BH - 96, 70, 50, t.s < 0);
        btn(">", 82, BH - 96, 70, 50, t.s > 0);
        btn("BRAKE", BW - 196, BH - 92, 62, 40, t.brake);
        btn("ITEM", BW - 128, BH - 132, 46, 40, false);
      }
    }
    if (this.state === "count") {
      const n = 3 - Math.floor(this.stateT);
      if (n >= 1) text(String(n), BW / 2, 70, 48, "#ffe23c", "center");
    }
    if (this.flashT > 0 && this.state === "race") text(this.flash, BW / 2, 74, 22, "#ffe23c", "center");
    if (this.state === "race" && me.lost > 1) text("WRONG WAY? PRESS R", BW / 2, 120, 8, "#fff", "center");

    if (this.state === "title") {
      ctx.fillStyle = "rgba(10,3,18,0.62)";
      ctx.fillRect(ox, oy, BW * u, BH * u);
      text("PINK KART", BW / 2, 44, 34, "#ff46c8", "center");
      text("DEMO - TRACK 1", BW / 2, 88, 10, "#ffe23c", "center");
      ITEMS.forEach((it, i) => pic(this.img[`item-${it}`], BW / 2 - 7 * 19 + i * 38 + 3, 112, 32 / 48));
      if (this.touch) {
        text("LEFT THUMB: STEER   RIGHT: ITEM / BRAKE", BW / 2, 166, 7, "#fff", "center");
        text("THE KART DRIVES BY ITSELF", BW / 2, 182, 7, "#fff", "center");
        if (Math.floor(this.stateT * 2) % 2 === 0) text("TAP TO RACE", BW / 2, 214, 14, "#fff", "center");
      } else {
        text("ARROWS OR WASD: DRIVE     SPACE: USE ITEM", BW / 2, 166, 7, "#fff", "center");
        text("R: BACK ON THE ROAD     ESC: PAUSE", BW / 2, 182, 7, "#fff", "center");
        if (Math.floor(this.stateT * 2) % 2 === 0) text("PRESS ENTER", BW / 2, 214, 14, "#fff", "center");
      }
    }
    if (this.state === "done") {
      ctx.fillStyle = `rgba(10,3,18,${Math.min(0.72, this.stateT)})`;
      ctx.fillRect(ox, oy, BW * u, BH * u);
      const order = [...this.karts].sort((a, b) => a.place - b.place);
      text(me.place === 1 ? "YOU WIN!" : `YOU FINISHED ${PLACE[me.place - 1]}`, BW / 2, 30, 20, "#ffe23c", "center");
      order.forEach((k, i) => {
        const col = k.player ? "#ff46c8" : "#fff";
        text(PLACE[i], 130, 74 + i * 22, 10, col);
        text(k.name, 190, 74 + i * 22, 10, col);
        text(k.finished ? fmtTime(k.time) : "...", 350, 74 + i * 22, 10, col, "right");
      });
      if (this.stateT > 1.5 && Math.floor(this.stateT * 2) % 2 === 0) text(this.touch ? "TAP TO RACE AGAIN" : "ENTER: RACE AGAIN", BW / 2, 226, 10, "#fff", "center");
    }
    if (this.paused) {
      ctx.fillStyle = "rgba(10,3,18,0.7)";
      ctx.fillRect(ox, oy, BW * u, BH * u);
      text("PAUSED", BW / 2, 110, 22, "#ff46c8", "center");
      text("ESC OR ENTER TO GO ON", BW / 2, 146, 8, "#fff", "center");
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

    // ---- sky (the strip wraps around twice per full turn)
    const sky = this.img["sky"];
    let off = (((ca / Math.PI) * sky.width) % sky.width + sky.width) % sky.width;
    off = Math.round(off);
    const skyY = HORIZON + 4 - sky.height;
    b.fillStyle = "#100628";
    b.fillRect(0, 0, BW, HORIZON);
    b.drawImage(sky, -off, skyY);
    b.drawImage(sky, sky.width - off, skyY);

    // ---- ground
    const S = this.track.size;
    const out = this.frame32;
    const G = this.ground;
    const rows = BH - HORIZON;
    const FOG_R = 235, FOG_G = 50, FOG_B = 170;
    for (let r = 0; r < rows; r++) {
      const z = (CAM_H * FOCAL) / (r + 0.5);
      const stepX = (rx * z) / FOCAL, stepY = (ry * z) / FOCAL;
      let wx = camX + dx * z - stepX * (BW / 2), wy = camY + dy * z - stepY * (BW / 2);
      const fog = z > 500 ? Math.min(0.85, (z - 500) / 2600) : 0;
      const f256 = (fog * 256) | 0, inv = 256 - f256;
      let o = r * BW;
      for (let x = 0; x < BW; x++, o++) {
        const ix = wx | 0, iy = wy | 0;
        let c: number;
        if (ix >= 0 && iy >= 0 && ix < S && iy < S) c = G[iy * S + ix];
        else c = ((ix % 96) + 96) % 96 < 3 || ((iy % 96) + 96) % 96 < 3 ? 0xff4a103a : 0xff200914;
        if (f256) {
          const cr = ((c & 255) * inv + FOG_R * f256) >> 8;
          const cg = (((c >> 8) & 255) * inv + FOG_G * f256) >> 8;
          const cb = (((c >> 16) & 255) * inv + FOG_B * f256) >> 8;
          c = 0xff000000 | (cb << 16) | (cg << 8) | cr;
        }
        out[o] = c;
        wx += stepX;
        wy += stepY;
      }
    }
    b.putImageData(this.frame, 0, HORIZON);

    // ---- everything standing on the ground
    const list: Sprite[] = [];
    const flame = Math.floor(performance.now() / 90) % 2;
    for (const k of this.karts) {
      let rel = wrapAngle(k.a + k.spinA - ca);
      if (k === me && k.spin <= 0) rel = 0;
      const ar = Math.abs(rel);
      const view = ar < Math.PI / 4 ? "back" : ar > (Math.PI * 3) / 4 ? "front" : "side";
      const im = this.kartSkins[k.skin][view];
      const fw = im.width / 2;
      list.push({ img: im, sx: (k.boost > 0 ? Math.floor(performance.now() / 45) % 2 : flame) * fw, sw: fw, sh: im.height, x: k.x, y: k.y, k: KART_SCALE, lift: 0, flip: view === "side" && rel < 0, shadow: true });
    }
    for (const bx of this.boxes)
      if (bx.back <= 0) {
        const im = this.img["itembox"];
        list.push({ img: im, sx: (Math.floor(performance.now() / 250) % 2) * 28, sw: 28, sh: 28, x: bx.x, y: bx.y, k: 0.55, lift: 5 + Math.sin(performance.now() / 300 + bx.x) * 2, flip: false, shadow: true });
      }
    for (const p of this.track.props) list.push({ img: this.img["props"], sx: p[2] * 40, sw: 40, sh: 64, x: p[0], y: p[1], k: 1.1, lift: 0, flip: false, shadow: false });
    for (const t of this.things) {
      if (t.kind === "boom" || t.kind === "wave") {
        const g = t.t / t.life;
        list.push({ img: this.boom, sx: 0, sw: 64, sh: 64, x: t.x, y: t.y, k: t.kind === "wave" ? 0.6 + g * 4 : 0.5 + g * 1.8, lift: 0, flip: false, shadow: false });
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
      if (px < -120 || px > BW + 120) continue;
      proj.push({ s, z, px, py: HORIZON + CAM_H * sc, sc });
    }
    proj.sort((a, c) => c.z - a.z);
    for (const p of proj) {
      const s = p.s;
      const w = s.sw * s.k * p.sc, h = s.sh * s.k * p.sc;
      if (w < 1.5) continue;
      const x = Math.round(p.px - w / 2), y = Math.round(p.py - h - s.lift * p.sc);
      if (s.shadow) {
        b.fillStyle = "rgba(10,2,16,0.4)";
        b.fillRect(Math.round(p.px - w * 0.42), Math.round(p.py - Math.max(1, h * 0.05)), Math.round(w * 0.84), Math.max(1, Math.round(h * 0.1)));
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
