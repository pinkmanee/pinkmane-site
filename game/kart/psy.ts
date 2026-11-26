// PINK KART'S PSYCHEDELIC LOOK: everything here is drawn by code when a map loads (no pictures to download).
//   - the skies: swirling marbled clouds, big sparkle stars, a moon (or a sun) and a skyline of twisted towers
//   - the ground beside the road: glowing marble (pink candy, blue glitter or orange lava, depending on the map)
//   - the road: shaded cobblestones
//   - the things beside the road: twisted striped horn towers, spotted mushrooms and dotted candy trees,
//     mixed with PINKMANE's own weed plants (from props.png)
// Each map picks a theme in TRACKS (game/kart/kart.ts): psy: "candy" | "glitter" | "lava" | "ocean" | "gold".
//   - 808 TEMPLE ("gold"): black marble tiles with gold seams for the road (tilePixel)
//   - maps over water (GHOST SHIP BAY): the animated sea (waterPixel) and wooden planks for the road (plankPixel)

export type PsyTheme = "candy" | "glitter" | "lava" | "ocean" | "gold" | "smoke";
type RGB = [number, number, number];

// ---------------------------------------------------------------- colours of each theme (change them here)
const THEMES: Record<PsyTheme, {
  sky: RGB[]; // top of the sky -> the horizon
  swirl: RGB[]; // the marbled clouds
  field: RGB[]; // the marble bands of the ground beside the road
  sparkle: RGB; // the glints in the ground
  stones: RGB; // the cobblestones
  mortar: RGB; // the gaps between them
  glint: RGB; // the shine on the stones
  skyline: RGB; // the towers on the horizon
  windows: RGB;
  moon: RGB;
  fog: RGB; // the haze far away
  grass: RGB[]; // the fringe along the road: dark, middle, tip, bank
}> = {
  candy: {
    sky: [[18, 4, 40], [86, 18, 120], [214, 60, 170], [255, 150, 210]],
    swirl: [[255, 70, 200], [255, 220, 90], [80, 220, 255], [150, 70, 255], [255, 120, 60]],
    field: [[22, 6, 40], [70, 14, 104], [200, 40, 160], [255, 120, 210], [110, 30, 150], [30, 8, 56]],
    sparkle: [255, 236, 250],
    stones: [104, 92, 130], mortar: [26, 16, 40], glint: [255, 190, 240],
    skyline: [26, 8, 46], windows: [255, 214, 90], moon: [255, 244, 190],
    fog: [214, 70, 170],
    grass: [[30, 6, 44], [150, 40, 180], [255, 110, 220], [16, 4, 26]],
  },
  glitter: {
    sky: [[2, 4, 20], [10, 16, 70], [30, 50, 150], [90, 150, 255]],
    swirl: [[60, 120, 255], [140, 220, 255], [40, 30, 160], [180, 120, 255], [255, 255, 255]],
    field: [[6, 10, 50], [16, 30, 110], [36, 70, 190], [20, 40, 140], [10, 16, 70], [50, 100, 220]],
    sparkle: [220, 240, 255],
    stones: [60, 74, 140], mortar: [8, 10, 34], glint: [190, 230, 255],
    skyline: [4, 6, 28], windows: [255, 220, 120], moon: [230, 240, 255],
    fog: [40, 70, 190],
    grass: [[6, 10, 40], [40, 90, 200], [140, 210, 255], [4, 6, 22]],
  },
  lava: {
    sky: [[26, 4, 28], [110, 20, 50], [230, 80, 50], [255, 180, 80]],
    swirl: [[255, 120, 30], [255, 230, 90], [255, 60, 120], [160, 30, 90], [255, 255, 200]],
    field: [[14, 4, 4], [60, 10, 6], [200, 70, 10], [255, 160, 30], [255, 226, 110], [90, 20, 8]],
    sparkle: [255, 250, 200],
    stones: [88, 72, 70], mortar: [16, 8, 8], glint: [255, 190, 110],
    skyline: [30, 6, 16], windows: [255, 230, 120], moon: [255, 200, 90],
    fog: [230, 90, 50],
    grass: [[20, 8, 4], [70, 170, 50], [170, 255, 110], [12, 4, 2]],
  },
  gold: {
    sky: [[10, 4, 20], [50, 16, 70], [150, 50, 120], [255, 190, 90]],
    swirl: [[255, 214, 90], [255, 70, 200], [150, 80, 255], [255, 140, 60], [255, 255, 220]],
    field: [[10, 6, 10], [30, 20, 18], [120, 86, 30], [255, 210, 100], [60, 40, 20], [16, 10, 12]],
    sparkle: [255, 240, 180],
    stones: [104, 92, 130], mortar: [26, 16, 40], glint: [255, 190, 240],
    skyline: [16, 6, 24], windows: [255, 214, 90], moon: [255, 230, 150],
    fog: [150, 60, 110],
    grass: [[14, 8, 10], [140, 100, 30], [255, 214, 90], [8, 4, 6]],
  },
  smoke: {
    sky: [[26, 18, 36], [70, 48, 96], [150, 116, 176], [214, 186, 226]],
    swirl: [[120, 255, 160], [200, 120, 255], [255, 140, 220], [90, 210, 160], [240, 236, 255]],
    field: [[38, 28, 48], [84, 64, 104], [146, 116, 168], [104, 164, 126], [66, 48, 86], [48, 38, 58]],
    sparkle: [210, 255, 220],
    stones: [100, 92, 116], mortar: [30, 24, 38], glint: [210, 255, 220],
    skyline: [40, 28, 54], windows: [190, 255, 200], moon: [240, 236, 255],
    fog: [190, 160, 214],
    grass: [[30, 24, 40], [110, 200, 140], [200, 255, 200], [20, 16, 26]],
  },
  ocean: {
    sky: [[4, 8, 30], [14, 36, 86], [70, 100, 170], [255, 150, 200]],
    swirl: [[60, 220, 220], [255, 110, 200], [255, 220, 110], [140, 90, 255], [120, 255, 200]],
    field: [[120, 50, 90], [200, 110, 140], [255, 176, 170], [236, 140, 160], [170, 80, 120], [140, 60, 110]],
    sparkle: [255, 236, 170],
    stones: [104, 92, 130], mortar: [26, 16, 40], glint: [255, 190, 240],
    skyline: [8, 14, 40], windows: [255, 220, 120], moon: [240, 250, 255],
    fog: [60, 100, 170],
    grass: [[16, 30, 46], [50, 170, 150], [160, 255, 220], [8, 16, 26]],
  },
};
export const psyColours = (t: PsyTheme) => THEMES[t];

// ---------------------------------------------------------------- smooth noise (a small table, read with blending)
const NS = 256;
const table = (() => {
  const t = new Float32Array(NS * NS);
  let s = 1234567;
  for (let i = 0; i < t.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    t[i] = (s >>> 8) / 16777216;
  }
  return t;
})();
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = xi & (NS - 1), y0 = yi & (NS - 1), x1 = (x0 + 1) & (NS - 1), y1 = (y0 + 1) & (NS - 1);
  const a = table[y0 * NS + x0], b = table[y0 * NS + x1], c = table[y1 * NS + x0], d = table[y1 * NS + x1];
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1 + 17, y * 2.1 + 9) * 0.3 + noise(x * 4.3 + 41, y * 4.3 + 77) * 0.1;
function hash(a: number, b: number) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const abgr = (c: RGB) => (0xff000000 | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(stops: RGB[], t: number): RGB {
  t = t - Math.floor(t);
  const f = t * stops.length, i = Math.floor(f);
  return mix(stops[i % stops.length], stops[(i + 1) % stops.length], f - i);
}

// ---------------------------------------------------------------- the ground beside the road (x, y = world position)
export function fieldPixel(theme: PsyTheme, x: number, y: number): number {
  const T = THEMES[theme];
  const w = fbm(x / 170, y / 170);
  let c: RGB;
  if (theme === "glitter") {
    // deep blue, gently clouded, full of glitter
    c = ramp(T.field, w * 1.4 + fbm(x / 60 + 5, y / 60) * 0.25);
    const h = hash(x >> 1, y >> 1);
    if ((h & 1023) < 34) return abgr((h >> 12) & 1 ? T.sparkle : [120, 180, 255]);
  } else {
    // marble: bands that twist around (candy = pink and purple swirls, lava = orange and black)
    const v = Math.sin((x * 0.011 + y * 0.007) + w * (theme === "lava" ? 13 : 10));
    c = ramp(T.field, (v + 1) * 0.5 * 0.9 + w * 0.5);
    if ((hash(x >> 1, y >> 1) & 4095) < 14) return abgr(T.sparkle);
  }
  // a little darker overall, so the road stands out
  return abgr([c[0] * 0.78, c[1] * 0.78, c[2] * 0.78]);
}

// ---------------------------------------------------------------- the cobblestone road
const CELL = 13; // how big a stone is (world units)
/** a road pixel as cobblestones: shade 0-2 = the road picture's own light/dark tarmac */
export function cobblePixel(theme: PsyTheme, x: number, y: number, shade: number): number {
  const T = THEMES[theme];
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const h = hash(cx + i, cy + j);
      const px = (cx + i + 0.15 + ((h & 255) / 255) * 0.7) * CELL, py = (cy + j + 0.15 + (((h >> 8) & 255) / 255) * 0.7) * CELL;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        best = h;
        bx = px;
        by = py;
      } else if (d < d2) d2 = d;
    }
  const gap = Math.sqrt(d2) - Math.sqrt(d1);
  if (gap < 1.4) return abgr(T.mortar);
  // each stone a little different, lit from the top left like a rounded stone
  const vary = 0.82 + ((best >>> 16) & 255) / 255 * 0.3 + (shade - 1) * 0.04;
  const lx = (x - bx) / CELL, ly = (y - by) / CELL;
  const dome = 1.12 - Math.sqrt(lx * lx + ly * ly) * 0.9 - (lx + ly) * 0.35;
  let c: RGB = [T.stones[0] * vary * dome, T.stones[1] * vary * dome, T.stones[2] * vary * dome];
  if (gap < 2.6) c = mix(c, T.mortar, 0.45); // the stone's edge sinks into the gap
  if (lx + ly < -0.45 && dome > 1.05 && gap > 3) c = mix(c, T.glint, 0.55); // the shine
  return abgr([Math.max(0, Math.min(255, c[0])), Math.max(0, Math.min(255, c[1])), Math.max(0, Math.min(255, c[2]))]);
}

// ---------------------------------------------------------------- the sea (maps over water): animated, x/y = world, t = seconds
const SEA_DEEP: RGB = [8, 20, 58], SEA_MID: RGB = [24, 62, 128], SEA_LIGHT = abgr([70, 150, 220]), SEA_FOAM = abgr([170, 236, 255]), SEA_GLINT = abgr([255, 246, 220]);
const SEA_RAMP = Array.from({ length: 8 }, (_, i) => abgr(mix(SEA_DEEP, SEA_MID, i / 7)));
export function waterPixel(x: number, y: number, t: number): number {
  const w = noise(x / 90 + t * 0.12, y / 90);
  const v = Math.sin(x * 0.07 + w * 6 + t * 1.3) + Math.sin(y * 0.06 - w * 5 - t * 1.0);
  if (v > 1.9) return SEA_FOAM; // the crest of a wave
  if (v > 1.72) return SEA_LIGHT;
  if ((hash((x >> 2) + Math.floor(t * 2) * 977, y >> 2) & 2047) < 3) return SEA_GLINT; // moonlight glinting on the waves
  return SEA_RAMP[Math.min(7, Math.floor(w * 9))];
}

// ---------------------------------------------------------------- the wooden road (planks): key = the road picture's colour key
const WOOD_A: RGB = [132, 80, 122], WOOD_B: RGB = [108, 64, 108];
export function plankPixel(key: string, x: number, y: number): number {
  if (key === "t0") return abgr([30, 12, 34]); // the gaps between planks
  if (key === "cp") return abgr([76, 36, 74]); // the rails
  if (key === "cw") return abgr([238, 224, 208]); // the rail posts (bone white)
  if (key === "edge") return abgr([24, 8, 24]);
  if (key === "dash") return 0;
  const base = key === "t1" ? WOOD_A : WOOD_B;
  const grain = 0.86 + noise(x / 3.5, y / 3.5) * 0.28; // wood grain
  const glint = (hash(x >> 1, y >> 1) & 1023) < 3; // a little pink shine here and there
  return glint ? abgr([255, 160, 230]) : abgr([base[0] * grain, base[1] * grain, base[2] * grain]);
}

// ---------------------------------------------------------------- the marble road (808 TEMPLE): black marble tiles, gold seams
export function tilePixel(key: string, x: number, y: number): number {
  if (key === "t0") return abgr([232, 178, 62]); // the gold seams between tiles
  if (key === "cw") return abgr([255, 214, 90]); // gold curb
  if (key === "cp") return abgr([18, 10, 22]); // black curb
  if (key === "edge") return abgr([10, 6, 12]);
  if (key === "dash") return 0;
  const w = noise(x / 40, y / 40);
  if (w > 0.55 && Math.abs(Math.sin(x * 0.045 + y * 0.02 + w * 9)) < 0.03) return abgr([150, 140, 176]); // faint veins in the marble, here and there
  const base: RGB = key === "t1" ? [30, 22, 38] : [42, 32, 52];
  const k = 0.85 + w * 0.35;
  return (hash(x >> 1, y >> 1) & 1023) < 4 ? abgr([255, 230, 160]) : abgr([base[0] * k, base[1] * k, base[2] * k]);
}

// ---------------------------------------------------------------- inside 808 TEMPLE: instead of the sky, walls of speakers
export function makeTempleWall(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#0c0612";
  x.fillRect(0, 0, W, H);
  const CW = 32; // one speaker cabinet wide (W is a multiple of it, so it joins up all the way round)
  for (let col = 0; col < W / CW; col++) {
    for (let row = 0; row < 4; row++) {
      const cx = col * CW, cy = H - 8 - (row + 1) * 26 + (col % 2) * 6;
      x.fillStyle = "#160c1c";
      x.fillRect(cx + 1, cy, CW - 2, 25);
      x.fillStyle = "#c8902c";
      x.fillRect(cx + 1, cy, CW - 2, 1);
      x.fillRect(cx + 1, cy + 24, CW - 2, 1);
      // the cone: pink rings around a dark centre
      const r = 9 - row;
      for (let dy = -r; dy <= r; dy++) {
        const hw = Math.round(Math.sqrt(r * r - dy * dy));
        x.fillStyle = Math.abs(dy) > r - 2 || hw < 3 ? "#3a0c30" : dy % 3 === 0 ? "#ff3cbe" : "#c22890";
        x.fillRect(cx + CW / 2 - hw, cy + 12 + dy, hw * 2, 1);
      }
      x.fillStyle = "#ffc850";
      x.fillRect(cx + CW / 2 - 1, cy + 11, 2, 2);
    }
  }
  // the ceiling beams fading into the dark at the top, and a gold line along the floor
  for (let y = 0; y < H * 0.25; y++) {
    x.fillStyle = `rgba(12,6,18,${1 - y / (H * 0.25)})`;
    x.fillRect(0, y, W, 1);
  }
  x.fillStyle = "#ffc850";
  x.fillRect(0, H - 6, W, 2);
  return c;
}

// ---------------------------------------------------------------- the sky (wraps around once: its width = one full turn)
export function makePsySky(theme: PsyTheme, W: number, H: number): HTMLCanvasElement {
  const T = THEMES[theme];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  const img = x.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const TAU = Math.PI * 2;
  // swirl centres along the sky (the pattern repeats exactly once around)
  const swirls = [0.08, 0.31, 0.55, 0.79].map((f, i) => ({ x: f * W, y: 14 + (i % 2) * 14, r: 46 + (i % 3) * 10, s: i % 2 ? 1 : -1 }));
  for (let yy = 0; yy < H; yy++) {
    const g = yy / (H - 1);
    const base = g < 0.5 ? mix(T.sky[0], T.sky[1], g / 0.5) : g < 0.85 ? mix(T.sky[1], T.sky[2], (g - 0.5) / 0.35) : mix(T.sky[2], T.sky[3], (g - 0.85) / 0.15);
    for (let xx = 0; xx < W; xx++) {
      let col = base;
      // the marbled swirl clouds, fading out towards the horizon
      const fade = Math.max(0, 1 - yy / (H * 0.62));
      if (fade > 0) {
        const a = (xx / W) * TAU;
        const wv = noise(Math.cos(a) * 9 + 50, Math.sin(a) * 9 + yy / 14) * 3.2;
        let v = Math.sin(a * 10 + yy * 0.08 + wv * 2.4); // (exactly 10 waves around, so the sky joins up seamlessly)
        for (const s of swirls) {
          let dx = xx - s.x;
          if (dx > W / 2) dx -= W;
          if (dx < -W / 2) dx += W;
          const dy = (yy - s.y) * 1.6;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < s.r) {
            const k = 1 - d / s.r;
            v = v * (1 - k) + Math.sin(d * 0.32 - Math.atan2(dy, dx) * 2 * s.s + wv) * k;
          }
        }
        const band = (v + 1) / 2;
        if (band > 0.42) {
          const cc = ramp(T.swirl, band * 1.3 + wv * 0.15);
          col = mix(base, cc, Math.min(1, (band - 0.42) * 2.6) * fade * 0.9);
        }
      }
      px[yy * W + xx] = abgr(col);
    }
  }
  x.putImageData(img, 0, 0);
  // stars: dots, and big four-pointed sparkles
  for (let i = 0; i < W / 9; i++) {
    const h = hash(i, 77);
    const sx = h % W, sy = (h >>> 12) % Math.floor(H * 0.72);
    const big = (h >>> 5) % 9 === 0;
    x.fillStyle = (h >>> 3) % 3 === 0 ? "#fff3b0" : "#ffffff";
    if (big) {
      x.fillRect(sx - 3, sy, 7, 1);
      x.fillRect(sx, sy - 3, 1, 7);
      x.fillRect(sx - 1, sy - 1, 3, 3);
    } else x.fillRect(sx, sy, 1, 1);
  }
  // the moon (a crescent), or on the lava map a big low sun with stripes
  const mx = Math.round(W * 0.37);
  if (theme === "lava") {
    for (let dy = 0; dy < 26; dy++) {
      const hw = Math.round(Math.sqrt(26 * 26 - dy * dy));
      if (dy % 5 === 3 && dy < 14) continue; // the stripes through the sun
      x.fillStyle = dy > 16 ? "#fff0a0" : "#ffb040";
      x.fillRect(mx - hw, H - 18 - dy, hw * 2, 1);
    }
  } else {
    const [r, g, b] = T.moon;
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        if (dx * dx + dy * dy > 81) continue;
        if ((dx - 4) * (dx - 4) + (dy + 2) * (dy + 2) < 56) continue; // the bite out of it
        x.fillStyle = `rgb(${r},${g},${b})`;
        x.fillRect(mx + dx, 24 + dy, 1, 1);
      }
  }
  // the skyline on the horizon: twisted towers with lit windows, spiky cones, round domes
  const [sr, sg, sb] = T.skyline;
  x.fillStyle = `rgb(${sr},${sg},${sb})`;
  for (let i = 0; i < W / 22; i++) {
    const h = hash(i, 911);
    const tx = (i * 22 + (h % 14)) % W;
    const kind = (h >>> 8) % 4;
    const tall = 8 + ((h >>> 12) % 22);
    const bottom = H;
    if (kind === 0) {
      // a twisted tower: a column that wobbles, with a pointed roof
      for (let y = 0; y < tall; y++) {
        const wob = Math.round(Math.sin(y * 0.35 + i) * 2);
        x.fillRect(tx + wob, bottom - y, 6, 1);
      }
      for (let y = 0; y < 7; y++) x.fillRect(tx + Math.round(Math.sin(tall * 0.35 + i) * 2) + Math.floor(y / 2), bottom - tall - y, 6 - Math.floor(y / 2) * 2, 1);
      x.fillStyle = `rgb(${T.windows.join(",")})`;
      for (let y = 4; y < tall - 2; y += 5) x.fillRect(tx + 2 + Math.round(Math.sin(y * 0.35 + i) * 2), bottom - y, 2, 2);
      x.fillStyle = `rgb(${sr},${sg},${sb})`;
    } else if (kind === 1) {
      // a spiky cone
      for (let y = 0; y < tall; y++) {
        const hw = Math.round((1 - y / tall) * 7);
        x.fillRect(tx + 7 - hw, bottom - y, hw * 2, 1);
      }
    } else if (kind === 2) {
      // a round dome on a short block
      x.fillRect(tx, bottom - 6, 14, 6);
      for (let dy = 0; dy < 7; dy++) {
        const hw = Math.round(Math.sqrt(49 - dy * dy));
        x.fillRect(tx + 7 - hw, bottom - 6 - dy, hw * 2, 1);
      }
    } else {
      // low rolling hills between the buildings
      for (let dx = 0; dx < 24; dx++) {
        const hh = Math.round(Math.sin((dx / 24) * Math.PI) * 5);
        x.fillRect(tx + dx, bottom - hh, 1, hh);
      }
    }
  }
  return c;
}

// ---------------------------------------------------------------- the things beside the road
// The sheet has 6 pictures of 40 x 64 (drawn at double detail, 80 x 128). 0-2 are new psychedelic ones, 3-5 are
// PINKMANE's weed plants from the original props sheet, repainted: the black leaves fill with swirling tie-dye
// colours, the veins glow, and the outline stays (light green instead of pink when greenOutline is on).
export function makePsyProps(theme: PsyTheme, original: HTMLImageElement | HTMLCanvasElement, greenOutline = false): HTMLCanvasElement {
  const T = THEMES[theme];
  const R = 2, PW = 40 * R, PH = 64 * R;
  const c = document.createElement("canvas");
  c.width = PW * 6;
  c.height = PH;
  const x = c.getContext("2d")!;
  const sheetRes = original.height / 64;
  x.imageSmoothingEnabled = false;
  for (let i = 3; i < 6; i++) x.drawImage(original, i * 40 * sheetRes, 0, 40 * sheetRes, 64 * sheetRes, i * PW, 0, PW, PH);
  // ---- the psychedelic weed leaves
  {
    const wd = x.getImageData(PW * 3, 0, PW * 3, PH);
    const wp = new Uint32Array(wd.data.buffer);
    const veinCol: RGB = theme === "glitter" ? [200, 240, 255] : theme === "lava" ? [255, 250, 190] : [255, 236, 255];
    for (let Y = 0; Y < PH; Y++)
      for (let X = 0; X < PW * 3; X++) {
        const o = Y * PW * 3 + X;
        const v = wp[o];
        if (!(v >>> 24)) continue;
        const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
        if (r < 60 && g < 40 && b < 60) {
          // the leaf: swirling tie-dye bands in this map's colours, lighter towards the top, in 4 chunky light steps
          const w = noise(X / 14 + 3, Y / 14 + 11);
          const band = X * 0.016 + Y * 0.011 + w * 0.9;
          const col = T.swirl[(((Math.floor(band * 5) % T.swirl.length) + T.swirl.length) % T.swirl.length)]; // clean stripes, no muddy blends
          const lightness = 0.55 + Math.round((1 - Y / PH) * 0.6 * 4 + w * 1.2) / 4 * 0.35;
          wp[o] = abgr([Math.min(255, col[0] * lightness), Math.min(255, col[1] * lightness), Math.min(255, col[2] * lightness)]);
        } else if (b > r) {
          wp[o] = abgr(veinCol); // the veins glow
        } else if (greenOutline) {
          wp[o] = abgr([128, 220, 105]); // the outline, light green on this map
        }
      }
    x.putImageData(wd, PW * 3, 0);
  }
  const img = x.getImageData(0, 0, PW * 3, PH);
  const px = new Uint32Array(img.data.buffer);
  const OUT: RGB = [16, 6, 24];
  const put = (p: number, X: number, Y: number, col: RGB) => {
    if (X < 0 || Y < 0 || X >= PW || Y >= PH) return;
    px[Y * PW * 3 + p * PW + X] = abgr(col);
  };
  // light from the top left: 4 steps of shading (the early-3D look)
  const lit = (col: RGB, l: number): RGB => {
    const k = 0.5 + Math.round(Math.max(0, Math.min(1, l)) * 4) / 4 * 0.6;
    return [Math.min(255, col[0] * k), Math.min(255, col[1] * k), Math.min(255, col[2] * k)];
  };
  const stripes = T.swirl;
  for (let Y = 0; Y < PH; Y++)
    for (let X = 0; X < PW; X++) {
      // 0: a twisted horn tower, spiral stripes, slightly bent
      {
        const t = Y / PH; // 0 = tip, 1 = base
        const bend = Math.sin(t * 3.2) * 6;
        const hw = 3 + t * 26;
        const dx = X - PW / 2 - bend;
        if (Math.abs(dx) < hw) {
          const u = dx / hw; // -1 .. 1 across
          const band = Math.floor((Y * 0.22 + Math.asin(Math.max(-1, Math.min(1, u))) * 3.2) / 1) ;
          const col = stripes[((band % stripes.length) + stripes.length) % stripes.length];
          put(0, X, Y, Math.abs(dx) > hw - 2 ? OUT : lit(col, 0.9 - u * 0.6 - 0.25));
        }
      }
      // 1: a spotted mushroom
      {
        const capY = PH * 0.42, capR = 34;
        const dx = X - PW / 2, dy = Y - capY;
        if (dy < 0 && dx * dx + (dy * 1.5) * (dy * 1.5) < capR * capR) {
          const e = Math.sqrt(dx * dx + (dy * 1.5) * (dy * 1.5));
          const spot = (((X >> 3) * 7 + (Y >> 3) * 13) % 5 === 0) && ((X & 7) > 1 && (X & 7) < 6 && (Y & 7) > 1 && (Y & 7) < 6);
          const base: RGB = theme === "glitter" ? [90, 140, 255] : theme === "lava" ? [255, 110, 30] : [255, 60, 150];
          put(1, X, Y, e > capR - 2 ? OUT : lit(spot ? [255, 250, 240] : base, 0.95 - dx / capR * 0.5 + dy / capR * 0.4));
        } else if (dy >= 0 && dy < 6 && Math.abs(dx) < capR * 0.8) {
          put(1, X, Y, dy < 2 ? OUT : lit([200, 170, 210], 0.4)); // the gills under the cap
        } else if (Y > capY && Math.abs(dx) < 9 + (Y - capY) * 0.06) {
          const w = 9 + (Y - capY) * 0.06;
          put(1, X, Y, Math.abs(dx) > w - 2 ? OUT : lit([240, 232, 220], 0.9 - dx / w * 0.5));
        }
      }
      // 2: a candy tree: a dotted round blob on a twisty trunk
      {
        const cy = PH * 0.36, r = 30;
        const dx = X - PW / 2, dy = Y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r) {
          const dot = ((X >> 2) + (Y >> 2) * 3) % 7 === 0 && (X & 3) > 0 && (Y & 3) > 0;
          const dc = stripes[((X >> 2) * 5 + (Y >> 2)) % stripes.length];
          const base: RGB = theme === "glitter" ? [60, 90, 230] : theme === "lava" ? [200, 50, 30] : [255, 120, 210];
          put(2, X, Y, d > r - 2 ? OUT : lit(dot ? dc : base, 0.95 - dx / r * 0.5 - dy / r * 0.4));
        } else if (Y > cy + r - 4) {
          const tx = PW / 2 + Math.sin(Y * 0.12) * 4;
          if (Math.abs(X - tx) < 5) put(2, X, Y, Math.abs(X - tx) > 3 ? OUT : lit([60, 30, 40], 0.6 - (X - tx) / 8));
        }
      }
    }
  x.putImageData(img, 0, 0);
  (c as { pkRes?: number }).pkRes = R;
  return c;
}
