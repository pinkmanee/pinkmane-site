// THE ASCII LOOK: the scene is drawn small, then every little cell of it becomes a coloured text character.
// Brighter = a denser character. Edges get - | / \ so slopes and walls read as lines.
// Two layers: the world in big characters, Pinkmane in small, dense ones (so he pops out).
// - The grid of characters moves WITH what it shows (the world / Pinkmane), so characters don't flicker when you run.
// - Solid things get a dim block of their colour behind the characters (tint), so ground reads as ground.
// - Pinkmane gets a dark outline (halo), so he never gets lost in the world.
// - A swirl (warp) can twist everything into a point: the door vortex.
// (The characters are written straight into pixels: much faster than drawing thousands of letters.)

export type AsciiStyle = {
  levels: string[]; // characters from dim to bright; each group = characters of the same brightness (one is picked per cell)
  edges: boolean; // use - | / \ on sharp edges
  edgeStrength: number; // how sharp an edge has to be to get a line character (0..1)
  threshold: number; // cells darker than this stay empty (0..1)
  gamma: number; // < 1 = more cells get dense characters
  boost: number; // characters get this much brighter than the drawing (1 = as drawn)
  solid: boolean; // true = every character at full strength (for Pinkmane: bright, not see-through)
  tint: number; // 0..1: a dim block of each cell's colour behind its character (the bottom layer only)
  halo: number; // 0..1: a dark block behind each character (a layer on top: separates it from what's under it)
  crisp: number; // how much stronger the characters' own pixels are (small characters need more)
};

// the world: big characters
export const WORLD_STYLE: AsciiStyle = {
  levels: [".", ":", ";", "-~", "+", "=+", "<>", "*x", "#", "H#"],
  edges: true,
  edgeStrength: 0.24,
  threshold: 0.075,
  gamma: 0.85,
  boost: 1.3,
  solid: false,
  tint: 0.3,
  halo: 0,
  crisp: 1.35,
};
// Pinkmane: small, dense characters (letters give him texture)
export const PLAYER_STYLE: AsciiStyle = {
  levels: [":", "=+", "zs", "ZS", "#%", "%&#", "@#&", "@#"],
  edges: false, // (line characters on him look like noise: he's all dense letters)
  edgeStrength: 0.42,
  threshold: 0.08,
  gamma: 0.6,
  boost: 1.15,
  solid: true,
  tint: 0,
  halo: 0.85,
  crisp: 2,
};

// the swirl: everything near (cx, cy) gets twisted round and pulled in. All in screen px.
export type Warp = { cx: number; cy: number; radius: number; twist: number; pull: number };
// TEXT FILL: dim cells (darker than maxLum) spell out `chars` over and over instead (rows scroll left / right by `shift`)
export type TextFill = { chars: string; maxLum: number; shift: number };
// LIQUID: around (x, y) the characters wobble, scramble and glow pink, like the code is liquid (k = 0..1 strength).
// Only touches cells darker than maxLum (so bright things - paths, buttons - stay still). Screen px.
export type Liquid = { x: number; y: number; r: number; t: number; k: number; maxLum: number };

const EDGE_CHARS = ["-", "\\", "|", "/"];
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const HALO = [7, 6, 12]; // the colour of the dark outline

type Glyph = { off: Int32Array; dx: Int16Array; dy: Int16Array; a: Uint8Array }; // the lit pixels of one character

export class AsciiLayer {
  readonly scene: HTMLCanvasElement; // draw the scene in here (one pixel = one character)
  readonly sctx: CanvasRenderingContext2D;
  ox = 0; // where the grid starts on screen (css px, between -cell and 0): set this BEFORE drawing the scene
  oy = 0;
  cols = 0;
  rows = 0;
  cw = 1; // a cell's size on screen (css px)
  ch = 1;
  private out: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private line = new Uint32Array(0); // one row of pixels (the background + dim blocks), copied down a whole row of cells
  private warpBuf = new Uint8ClampedArray(0);
  private buf = new Uint32Array(0);
  private chars: string[] = [];
  private glyphs: Glyph[] = [];
  private levelIdx: number[][] = [];
  private edgeIdx: number[] = [];
  private dpr = 1;
  private pw = 0; // the screen in real pixels
  private ph = 0;
  private gw = 1; // a character in real pixels
  private gh = 1;
  private lum = new Float32Array(0);

  constructor(private style: AsciiStyle) {
    this.scene = document.createElement("canvas");
    const s = this.scene.getContext("2d", { willReadFrequently: true });
    this.out = document.createElement("canvas");
    const o = this.out.getContext("2d");
    if (!s || !o) throw new Error("no canvas");
    this.sctx = s;
    this.octx = o;
    for (const group of style.levels) {
      const ids: number[] = [];
      for (const c of group) ids.push(this.charId(c));
      this.levelIdx.push(ids);
    }
    this.edgeIdx = EDGE_CHARS.map((c) => this.charId(c));
    for (const c of "PINKMANE") this.charId(c); // (for the text fill)
  }

  private charId(c: string) {
    let i = this.chars.indexOf(c);
    if (i < 0) {
      this.chars.push(c);
      i = this.chars.length - 1;
    }
    return i;
  }

  // the cell size this layer was last made for (to skip remaking it for tiny changes)
  get cell() {
    return this.cw;
  }

  // W, H = the screen in css px; cell = how wide one character is (css px); ratio = how much taller than wide
  resize(W: number, H: number, dpr: number, cell: number, ratio: number) {
    this.dpr = dpr;
    this.cw = cell;
    this.ch = cell * ratio;
    this.cols = Math.ceil(W / this.cw) + 2;
    this.rows = Math.ceil(H / this.ch) + 2;
    this.scene.width = this.cols;
    this.scene.height = this.rows;
    this.pw = Math.round(W * dpr);
    this.ph = Math.round(H * dpr);
    this.out.width = this.pw;
    this.out.height = this.ph;
    this.img = this.octx.createImageData(this.pw, this.ph);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.line = new Uint32Array(this.pw);
    this.warpBuf = new Uint8ClampedArray(this.cols * this.rows * 4);
    this.lum = new Float32Array(this.cols * this.rows);
    // draw every character once, white, and remember which of its pixels are lit
    const gw = Math.max(2, Math.floor(this.cw * dpr));
    const gh = Math.max(2, Math.floor(this.ch * dpr));
    this.gw = gw;
    this.gh = gh;
    const g = document.createElement("canvas");
    g.width = gw;
    g.height = gh;
    const gc = g.getContext("2d", { willReadFrequently: true });
    if (!gc) return;
    gc.fillStyle = "#ffffff";
    gc.textAlign = "center";
    gc.textBaseline = "middle";
    gc.font = `bold ${Math.max(4, Math.round(gh * 0.86))}px ${FONT}`;
    this.glyphs = this.chars.map((c) => {
      gc.clearRect(0, 0, gw, gh);
      gc.fillText(c, gw / 2, gh / 2 + 0.5);
      const d = gc.getImageData(0, 0, gw, gh).data;
      const off: number[] = [];
      const dx: number[] = [];
      const dy: number[] = [];
      const a: number[] = [];
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const v = d[(y * gw + x) * 4 + 3];
          if (v > 30) {
            off.push(y * this.pw + x);
            dx.push(x);
            dy.push(y);
            a.push(Math.min(255, Math.round(v * this.style.crisp)));
          }
        }
      return { off: Int32Array.from(off), dx: Int16Array.from(dx), dy: Int16Array.from(dy), a: Uint8Array.from(a) };
    });
  }

  // put the grid's start where world/player position `screenPos` falls, so the grid moves with it
  anchor(screenX: number, screenY: number) {
    this.ox = ((screenX % this.cw) + this.cw) % this.cw - this.cw;
    this.oy = ((screenY % this.ch) + this.ch) % this.ch - this.ch;
  }

  // the scene canvas transform for drawing in screen px (multiply your world transform after this)
  // scene px = (screen px - origin) / cell
  sceneMatrix(): [number, number, number, number] {
    return [1 / this.cw, 1 / this.ch, -this.ox / this.cw, -this.oy / this.ch];
  }

  // turn the scene into characters and put them on the screen.
  // background = this is the bottom layer: fill the screen with this colour first
  // region (css px) = only this part of the screen (faster, for Pinkmane)
  // seed = change it every frame to make the characters flicker (like code rain); leave it out for steady characters
  compose(
    target: CanvasRenderingContext2D,
    opts: { background?: [number, number, number]; region?: { x0: number; y0: number; x1: number; y1: number }; warp?: Warp | null; seed?: number; text?: TextFill; liquid?: Liquid | null } = {},
  ) {
    const img = this.img;
    if (!img) return;
    const st = this.style;
    const { cw, ch, ox, oy } = this;
    const warp = opts.warp ?? null;
    const region = warp ? undefined : opts.region;
    const c0 = region ? Math.max(0, Math.floor((region.x0 - ox) / cw)) : 0;
    const r0 = region ? Math.max(0, Math.floor((region.y0 - oy) / ch)) : 0;
    const c1 = region ? Math.min(this.cols, Math.ceil((region.x1 - ox) / cw)) : this.cols;
    const r1 = region ? Math.min(this.rows, Math.ceil((region.y1 - oy) / ch)) : this.rows;
    const w = c1 - c0;
    const h = r1 - r0;
    if (w <= 0 || h <= 0) return;
    let data = this.sctx.getImageData(c0, r0, w, h).data;
    if (warp) data = this.applyWarp(data, w, h, warp);
    const L = this.lum;
    for (let i = 0, n = w * h; i < n; i++) {
      const k = i * 4;
      L[i] = ((0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255) * (data[k + 3] / 255);
    }
    // the part of the screen we touch (real pixels)
    const dpr = this.dpr;
    const pw = this.pw;
    const ph = this.ph;
    const px0 = Math.max(0, Math.floor((c0 * cw + ox) * dpr));
    const py0 = Math.max(0, Math.floor((r0 * ch + oy) * dpr));
    const px1 = Math.min(pw, Math.ceil((c1 * cw + ox) * dpr));
    const py1 = Math.min(ph, Math.ceil((r1 * ch + oy) * dpr));
    if (px1 <= px0 || py1 <= py0) return;
    const buf = this.buf;
    const bgc = opts.background;
    const [BR, BG, BB] = bgc ?? [0, 0, 0];
    const opaque = !!bgc; // the bottom layer: we write the finished, solid picture ourselves
    const tint = opaque ? st.tint : 0;
    if (!opaque) for (let y = py0; y < py1; y++) buf.fill(0, y * pw + px0, y * pw + px1);
    else {
      // (rows above/below the grid, if any)
      const clear = ((255 << 24) | (BB << 16) | (BG << 8) | BR) >>> 0;
      for (let y = py0; y < py1; y++) buf.fill(clear, y * pw + px0, y * pw + px1);
    }

    const nl = st.levels.length;
    const gw = this.gw;
    const gh = this.gh;
    const boost = st.boost;
    const haloA = Math.round(st.halo * 255);
    const line = this.line;
    const text = opts.text;
    const textIds = text ? Array.from(text.chars).map((c) => this.charId(c)) : [];
    const liq = opts.liquid && opts.liquid.k > 0.01 ? opts.liquid : null;
    const liqR2 = liq ? liq.r * liq.r : 0;
    for (let y = 0; y < h; y++) {
      const sy0 = Math.round(((y + r0) * ch + oy) * dpr);
      const sy1 = Math.round(((y + r0 + 1) * ch + oy) * dpr);
      if (sy1 <= 0 || sy0 >= ph) continue;
      if (opaque) {
        // the background with a dim block of each cell's colour, made once for this row of cells, then copied down
        const clear = ((255 << 24) | (BB << 16) | (BG << 8) | BR) >>> 0;
        line.fill(clear, px0, px1);
        if (tint > 0)
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const a = (data[k + 3] / 255) * tint;
            const lx0 = Math.max(px0, Math.round(((x + c0) * cw + ox) * dpr));
            const lx1 = Math.min(px1, Math.round(((x + c0 + 1) * cw + ox) * dpr));
            if (lx1 <= lx0) continue;
            const r = (BR + (data[k] - BR) * a) | 0;
            const g = (BG + (data[k + 1] - BG) * a) | 0;
            const b = (BB + (data[k + 2] - BB) * a) | 0;
            line.fill(((255 << 24) | (b << 16) | (g << 8) | r) >>> 0, lx0, lx1);
          }
        const seg = line.subarray(px0, px1);
        for (let yy = Math.max(0, sy0); yy < Math.min(ph, sy1); yy++) buf.set(seg, yy * pw + px0);
      }
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = L[i];
        if (v < st.threshold) continue;
        const sx0 = Math.round(((x + c0) * cw + ox) * dpr);
        const sx1 = Math.round(((x + c0 + 1) * cw + ox) * dpr);
        if (sx1 <= 0 || sx0 >= pw) continue;
        let id = 0;
        let edge = -1;
        if (st.edges && x > 0 && y > 0 && x < w - 1 && y < h - 1) {
          const gx = L[i + 1] - L[i - 1];
          const gy = L[i + w] - L[i - w];
          if (gx * gx + gy * gy > st.edgeStrength * st.edgeStrength) {
            // the edge runs across the brightness change: pick - \ | /
            let a = Math.atan2(-gx, gy);
            if (a < 0) a += Math.PI;
            edge = Math.round(a / (Math.PI / 4)) % 4;
          }
        }
        // the liquid around the mouse: how strongly this cell is caught (0 = not at all)
        let ff = 0;
        let jx = 0;
        let jy = 0;
        if (liq && v < liq.maxLum) {
          const cx = (x + c0 + 0.5) * cw + ox;
          const cy = (y + r0 + 0.5) * ch + oy;
          const dx = cx - liq.x;
          const dy = cy - liq.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < liqR2) {
            const f = 1 - Math.sqrt(d2) / liq.r;
            ff = f * f * liq.k;
            jx = (Math.sin(cy * 0.07 + liq.t * 9) * 1.2 + Math.sin(cx * 0.05 - liq.t * 6) * 0.5) * cw * ff;
            jy = Math.cos(cx * 0.06 + liq.t * 8) * ch * 0.55 * ff;
          }
        }
        if (text && v < text.maxLum) {
          const yy = y + r0;
          const dir = yy & 1 ? 1 : -1;
          const n = textIds.length;
          const k = dir * (x + c0) + yy * 3 + text.shift + (ff > 0 ? Math.floor(ff * 4 + (liq ? liq.t : 0) * 14 * ff) : 0);
          id = textIds[((k % n) + n) % n];
          edge = -2;
        } else if (edge >= 0) id = this.edgeIdx[edge];
        else {
          const lv = Math.min(nl - 1, Math.floor(Math.pow(v, st.gamma) * nl));
          const grp = this.levelIdx[lv];
          id = grp[(((x + c0) * 7 + (y + r0) * 13 + (opts.seed ?? 0) * ((x * 31 + y * 17) % 5 === 0 ? 1 : 0)) % grp.length + grp.length) % grp.length];
        }
        const k = i * 4;
        let cr = Math.min(255, data[k] * boost) | 0;
        let cg = Math.min(255, data[k + 1] * boost) | 0;
        let cb = Math.min(255, data[k + 2] * boost) | 0;
        if (ff > 0) {
          // caught in the liquid: glow pink
          const g = Math.min(1, ff * 1.4);
          cr = (cr + (255 - cr) * g) | 0;
          cg = (cg + (90 - cg) * g) | 0;
          cb = (cb + (220 - cb) * g) | 0;
        }
        const strength = st.solid ? 255 : data[k + 3];
        // what's under the character: the dim block (bottom layer)
        let ur = BR;
        let ug = BG;
        let ub = BB;
        if (tint > 0) {
          const a = (data[k + 3] / 255) * tint;
          ur = (BR + (data[k] - BR) * a) | 0;
          ug = (BG + (data[k + 1] - BG) * a) | 0;
          ub = (BB + (data[k + 2] - BB) * a) | 0;
        }
        // where the character goes (moved a little when it's caught in the liquid)
        const gx0 = jx || jy ? sx0 + Math.round(jx * dpr) : sx0;
        const gy0 = jx || jy ? sy0 + Math.round(jy * dpr) : sy0;
        const inside = gx0 >= 0 && gy0 >= 0 && gx0 + gw <= pw && gy0 + gh <= ph;
        // the dark block behind the character
        if (haloA > 0) {
          const hx0 = Math.max(0, sx0);
          const hx1 = Math.min(pw, sx1);
          const hcol = ((haloA << 24) | (HALO[2] << 16) | (HALO[1] << 8) | HALO[0]) >>> 0;
          for (let yy = Math.max(0, sy0); yy < Math.min(ph, sy1); yy++) buf.fill(hcol, yy * pw + hx0, yy * pw + hx1);
        }
        const gl = this.glyphs[id];
        const ga = gl.a;
        const base = gy0 * pw + gx0;
        for (let j = 0; j < ga.length; j++) {
          let p: number;
          if (inside) p = base + gl.off[j];
          else {
            const px = gx0 + gl.dx[j];
            const py = gy0 + gl.dy[j];
            if (px < 0 || py < 0 || px >= pw || py >= ph) continue;
            p = py * pw + px;
          }
          const t = (ga[j] * strength) >> 8;
          if (opaque) {
            buf[p] = ((255 << 24) | ((ub + (((cb - ub) * t) >> 8)) << 16) | ((ug + (((cg - ug) * t) >> 8)) << 8) | (ur + (((cr - ur) * t) >> 8))) >>> 0;
          } else if (haloA > 0) {
            // the character on top of the dark block
            const r = HALO[0] + (((cr - HALO[0]) * t) >> 8);
            const g = HALO[1] + (((cg - HALO[1]) * t) >> 8);
            const b = HALO[2] + (((cb - HALO[2]) * t) >> 8);
            const a = haloA + (((255 - haloA) * t) >> 8);
            buf[p] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
          } else buf[p] = ((t << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
        }
      }
    }
    if (opaque) {
      // the bottom layer goes straight onto the screen
      target.putImageData(img, 0, 0, px0, py0, px1 - px0, py1 - py0);
      return;
    }
    this.octx.putImageData(img, 0, 0, px0, py0, px1 - px0, py1 - py0);
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.drawImage(this.out, px0, py0, px1 - px0, py1 - py0, px0, py0, px1 - px0, py1 - py0);
    target.restore();
  }

  // the swirl: every cell shows what's further out and turned back a bit, so everything spins into the middle
  private applyWarp(src: Uint8ClampedArray, w: number, h: number, wp: Warp) {
    const o = this.warpBuf.length >= w * h * 4 ? this.warpBuf.subarray(0, w * h * 4) : new Uint8ClampedArray(w * h * 4);
    o.fill(0);
    const { cw, ch, ox, oy } = this;
    const R2 = wp.radius * wp.radius;
    for (let y = 0; y < h; y++) {
      const py = (y + 0.5) * ch + oy - wp.cy;
      for (let x = 0; x < w; x++) {
        const px = (x + 0.5) * cw + ox - wp.cx;
        const r2 = px * px + py * py;
        const f = 1 / (1 + r2 / R2); // 1 in the middle, fading out
        const a = -wp.twist * f;
        const s = 1 + wp.pull * f;
        const ca = Math.cos(a) * s;
        const sa = Math.sin(a) * s;
        const qx = wp.cx + px * ca - py * sa;
        const qy = wp.cy + px * sa + py * ca;
        const sx = Math.floor((qx - ox) / cw);
        const sy = Math.floor((qy - oy) / ch);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const si = (sy * w + sx) * 4;
        const di = (y * w + x) * 4;
        o[di] = src[si];
        o[di + 1] = src[si + 1];
        o[di + 2] = src[si + 2];
        o[di + 3] = src[si + 3];
      }
    }
    return o;
  }
}
