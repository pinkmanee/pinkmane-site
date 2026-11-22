// THE ASCII LOOK: the scene is drawn small, then every little cell of it becomes a coloured text character.
// Brighter = a denser character. Edges get - | / \ so slopes and walls read as lines.
// Two layers: the world in big characters, Pinkmane in small, dense ones (so he pops out).
// (The characters are written straight into the screen's pixels: much faster than drawing thousands of letters.)

export type AsciiStyle = {
  levels: string[]; // characters from dim to bright; each group = characters of the same brightness (one is picked per cell)
  edges: boolean; // use - | / \ on sharp edges
  edgeStrength: number; // how sharp an edge has to be to get a line character (0..1)
  threshold: number; // cells darker than this stay empty (0..1)
  gamma: number; // < 1 = more cells get dense characters
  boost: number; // colours get this much brighter (1 = as drawn)
  solid: boolean; // true = every character at full strength (for Pinkmane: bright, not see-through)
};

// the world: big characters
export const WORLD_STYLE: AsciiStyle = {
  levels: [".", ":", ";", "-~", "+", "=+", "<>", "*x", "#", "H#"],
  edges: true,
  edgeStrength: 0.26,
  threshold: 0.05,
  gamma: 0.85,
  boost: 1.25,
  solid: false,
};
// Pinkmane: small, dense characters (letters give him texture)
export const PLAYER_STYLE: AsciiStyle = {
  levels: [":", "-=", "+=", "zs", "ZSN", "#%", "%#&", "#@&%"],
  edges: true,
  edgeStrength: 0.4,
  threshold: 0.08,
  gamma: 0.6,
  boost: 1.15,
  solid: true,
};

const EDGE_CHARS = ["-", "\\", "|", "/"];
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

type Glyph = { off: Int32Array; a: Uint8Array }; // the pixels of one character (where, and how strong)

export class AsciiLayer {
  readonly scene: HTMLCanvasElement; // draw the scene in here (one pixel = one character)
  readonly sctx: CanvasRenderingContext2D;
  private out: HTMLCanvasElement; // (only when the layer goes on top of another)
  private octx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private buf = new Uint32Array(0);
  private chars: string[] = [];
  private glyphs: Glyph[] = [];
  private levelIdx: number[][] = [];
  private edgeIdx: number[] = [];
  cols = 0;
  rows = 0;
  cw = 1; // a cell's size on screen (css px)
  ch = 1;
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
  }

  private charId(c: string) {
    let i = this.chars.indexOf(c);
    if (i < 0) {
      this.chars.push(c);
      i = this.chars.length - 1;
    }
    return i;
  }

  // W, H = the screen in css px; cell = how wide one character is (css px); ratio = how much taller than wide
  resize(W: number, H: number, dpr: number, cell: number, ratio: number) {
    this.dpr = dpr;
    this.cw = cell;
    this.ch = cell * ratio;
    this.cols = Math.ceil(W / this.cw) + 1;
    this.rows = Math.ceil(H / this.ch) + 1;
    this.scene.width = this.cols;
    this.scene.height = this.rows;
    this.pw = Math.round(W * dpr);
    this.ph = Math.round(H * dpr);
    this.out.width = this.pw;
    this.out.height = this.ph;
    this.img = this.octx.createImageData(this.pw, this.ph);
    this.buf = new Uint32Array(this.img.data.buffer);
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
      const a: number[] = [];
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const v = d[(y * gw + x) * 4 + 3];
          if (v > 30) {
            off.push(y * this.pw + x);
            a.push(Math.min(255, Math.round(v * 1.35))); // (a little crisper)
          }
        }
      return { off: Int32Array.from(off), a: Uint8Array.from(a) };
    });
  }

  // turn the scene into characters and put them on the screen.
  // background = fill the screen with this colour first (the bottom layer); without it the layer goes on top
  // region (css px) = only this part of the screen (faster, for Pinkmane)
  compose(target: CanvasRenderingContext2D, background?: [number, number, number], region?: { x0: number; y0: number; x1: number; y1: number }) {
    const img = this.img;
    if (!img) return;
    const st = this.style;
    const c0 = region ? Math.max(0, Math.floor(region.x0 / this.cw)) : 0;
    const r0 = region ? Math.max(0, Math.floor(region.y0 / this.ch)) : 0;
    const c1 = region ? Math.min(this.cols, Math.ceil(region.x1 / this.cw)) : this.cols;
    const r1 = region ? Math.min(this.rows, Math.ceil(region.y1 / this.ch)) : this.rows;
    const w = c1 - c0;
    const h = r1 - r0;
    if (w <= 0 || h <= 0) return;
    const data = this.sctx.getImageData(c0, r0, w, h).data;
    const L = this.lum;
    for (let i = 0, n = w * h; i < n; i++) {
      const k = i * 4;
      L[i] = ((0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255) * (data[k + 3] / 255);
    }
    // the part of the screen we touch (real pixels)
    const pw = this.pw;
    const ph = this.ph;
    const sx = this.cw * this.dpr;
    const sy = this.ch * this.dpr;
    const px0 = Math.max(0, Math.floor(c0 * sx));
    const py0 = Math.max(0, Math.floor(r0 * sy));
    const px1 = Math.min(pw, Math.ceil(c1 * sx));
    const py1 = Math.min(ph, Math.ceil(r1 * sy));
    if (px1 <= px0 || py1 <= py0) return;
    const buf = this.buf;
    const [br, bg, bb] = background ?? [0, 0, 0];
    const clear = background ? ((255 << 24) | (bb << 16) | (bg << 8) | br) >>> 0 : 0;
    for (let y = py0; y < py1; y++) buf.fill(clear, y * pw + px0, y * pw + px1);

    const nl = st.levels.length;
    const gw = this.gw;
    const gh = this.gh;
    const boost = st.boost;
    for (let y = 0; y < h; y++) {
      const oy = Math.round((y + r0) * sy);
      if (oy + gh > ph) continue;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = L[i];
        if (v < st.threshold) continue;
        const ox = Math.round((x + c0) * sx);
        if (ox + gw > pw) continue;
        let id: number;
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
        if (edge >= 0) id = this.edgeIdx[edge];
        else {
          const lv = Math.min(nl - 1, Math.floor(Math.pow(v, st.gamma) * nl));
          const grp = this.levelIdx[lv];
          id = grp[((x + c0) * 7 + (y + r0) * 13) % grp.length];
        }
        const k = i * 4;
        const cr = Math.min(255, data[k] * boost) | 0;
        const cg = Math.min(255, data[k + 1] * boost) | 0;
        const cb = Math.min(255, data[k + 2] * boost) | 0;
        const strength = st.solid ? 255 : data[k + 3];
        const gl = this.glyphs[id];
        const base = oy * pw + ox;
        const off = gl.off;
        const ga = gl.a;
        if (background) {
          // mix with the background colour
          for (let j = 0; j < off.length; j++) {
            const t = (ga[j] * strength) >> 8;
            buf[base + off[j]] = ((255 << 24) | ((bb + (((cb - bb) * t) >> 8)) << 16) | ((bg + (((cg - bg) * t) >> 8)) << 8) | (br + (((cr - br) * t) >> 8))) >>> 0;
          }
        } else {
          const col = (cb << 16) | (cg << 8) | cr;
          for (let j = 0; j < off.length; j++) buf[base + off[j]] = ((((ga[j] * strength) >> 8) << 24) | col) >>> 0;
        }
      }
    }
    if (background) {
      // the bottom layer goes straight onto the screen
      target.putImageData(img, 0, 0, px0, py0, px1 - px0, py1 - py0);
    } else {
      this.octx.putImageData(img, 0, 0, px0, py0, px1 - px0, py1 - py0);
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.drawImage(this.out, px0, py0, px1 - px0, py1 - py0, px0, py0, px1 - px0, py1 - py0);
      target.restore();
    }
  }
}
