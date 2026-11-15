// PINK SHOP: the shop screen every mini game shares, so they all look like PINKMANE VOID's shop.
// Dark purple screen, gold section headers, the list on the left, a preview box on the right,
// two info lines underneath, and your money in the top right corner.
//
// A game gives it:
//   rows   = what's in the shop (section headers, items, and a BACK row)
//   hooks  = how to read / spend that game's money, what you own, and how to draw the preview
// and calls drawPinkShop() every frame while the shop is open, shopMove() / shopAct() on keys,
// shopTap() on clicks / taps. Each game keeps its own money and its own items.
//
// Every game's start + game over screen also gets the same two side panels (drawSidePanels):
// your money on the left, a little preview + SHOP on the right (tap it, or press S / DOWN, to open the shop).

export type ShopRow =
  | { kind: "head"; label: string }
  // prices: ONE price = you buy it once (with wear: true it's a skin you then put on; price 0 = free)
  //         SEVERAL prices = an upgrade with that many levels, one price per level
  | { kind: "item"; id: string; name: string; prices: number[]; info: [string, string]; wear?: boolean }
  | { kind: "back" };

export type ShopBox = { x: number; y: number; w: number; h: number };

export type ShopHooks = {
  money: () => number;
  moneyName: string; // e.g. "GEMS" or "KIEF"
  icon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void; // an 8 x 8 picture of the money
  level: (id: string) => number; // how many times it was bought (0 = not yet). Free skins count as 1.
  worn: (id: string) => boolean;
  buy: (id: string, price: number) => void; // take the money and add a level (a skin is put on as well)
  wear: (id: string) => void;
  preview: (ctx: CanvasRenderingContext2D, id: string | null, box: ShopBox, t: number) => void; // draw inside the box
  sound: (what: "move" | "buy" | "no" | "wear") => void;
  // optional: a reason this item can't be bought yet (e.g. "FINISH ALL MISSIONS"), or null when it can
  locked?: (id: string) => string | null;
};

export type ShopUi = { index: number; t: number; msg: string; msgT: number };

// ---------- layout (the games are 320 x 150) ----------
const TOP = 18; // the first list row
const RH = 10; // row height
const VIS = 9; // rows you see at once (the list scrolls)
const LIST_X = 6;
const LIST_W = 206;
export const SHOP_BOX: ShopBox = { x: 218, y: 18, w: 96, h: 89 };
const CLOSE = { x: 3, y: 2, w: 20, h: 11 };

// ---------- colours (the same as PINKMANE VOID's shop) ----------
const INK = "#111111";
const PINK = "#d63cc8";
const GOLD = "#ffd700";

const selectable = (r: ShopRow) => r.kind !== "head";

export function newShopUi(rows: ShopRow[]): ShopUi {
  const i = rows.findIndex(selectable);
  return { index: Math.max(0, i), t: 0, msg: "", msgT: -9 };
}

const flash = (ui: ShopUi, msg: string) => {
  ui.msg = msg;
  ui.msgT = ui.t;
};

// UP / DOWN: the next row that isn't a header (it wraps around)
export function shopMove(rows: ShopRow[], ui: ShopUi, dir: 1 | -1, hooks: ShopHooks) {
  let i = ui.index;
  for (let n = 0; n < rows.length; n++) {
    i = (i + dir + rows.length) % rows.length;
    if (selectable(rows[i])) break;
  }
  ui.index = i;
  hooks.sound("move");
}

// OK on the highlighted row: buy it, put it on, or go back. Returns "close" when the shop should close.
export function shopAct(rows: ShopRow[], ui: ShopUi, hooks: ShopHooks): "close" | null {
  const row = rows[ui.index];
  if (!row || row.kind === "back") return "close";
  if (row.kind !== "item") return null;
  const lv = hooks.level(row.id);
  const max = row.prices.length;
  const lock = lv === 0 ? hooks.locked?.(row.id) : null;
  if (lock) {
    hooks.sound("no");
    flash(ui, lock);
    return null;
  }
  if (row.wear && lv > 0) {
    if (!hooks.worn(row.id)) {
      hooks.wear(row.id);
      hooks.sound("wear");
      flash(ui, "PUT ON!");
    }
    return null;
  }
  if (lv >= max) {
    hooks.sound("no");
    flash(ui, "ALREADY MAXED OUT");
    return null;
  }
  const price = row.prices[lv];
  if (hooks.money() < price) {
    hooks.sound("no");
    flash(ui, `YOU NEED ${price - hooks.money()} MORE ${hooks.moneyName}`);
    return null;
  }
  hooks.buy(row.id, price);
  hooks.sound("buy");
  flash(ui, row.wear ? "BOUGHT! YOU'RE WEARING IT" : lv + 1 >= max ? "MAXED OUT!" : `LEVEL ${lv + 1}!`);
  return null;
}

const firstRow = (rows: ShopRow[], ui: ShopUi) => Math.max(0, Math.min(ui.index - 4, rows.length - VIS));

// A click / tap (x, y in game pixels). The X closes it; a row: first tap picks it, tapping it again buys / puts it on;
// the preview box = OK on the picked row.
export function shopTap(rows: ShopRow[], ui: ShopUi, hooks: ShopHooks, x: number, y: number): "close" | null {
  if (x >= CLOSE.x && x <= CLOSE.x + CLOSE.w && y >= 0 && y <= CLOSE.y + CLOSE.h + 2) return "close";
  const b = SHOP_BOX;
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return shopAct(rows, ui, hooks);
  if (x >= LIST_X && x <= LIST_X + LIST_W && y >= TOP - 1 && y < TOP - 1 + VIS * RH) {
    const i = firstRow(rows, ui) + Math.floor((y - TOP + 1) / RH);
    if (i < 0 || i >= rows.length || !selectable(rows[i])) return null;
    if (i === ui.index) return shopAct(rows, ui, hooks);
    ui.index = i;
    hooks.sound("move");
  }
  return null;
}

// the shop, filling the whole screen. backLine = what the info line says on the BACK row.
export function drawPinkShop(
  ctx: CanvasRenderingContext2D,
  font: string,
  rows: ShopRow[],
  ui: ShopUi,
  hooks: ShopHooks,
  o: { W: number; H: number; touch: boolean; backLine: string }
) {
  const { W, H } = o;
  const on = Math.floor(ui.t * 3) % 2 === 0;
  ctx.fillStyle = "#2a1040";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#33164d";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.font = `8px ${font}`;
  ctx.textBaseline = "top";

  // title + money
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.fillText("PINK SHOP", W / 2 + 1, 6);
  ctx.fillStyle = GOLD;
  ctx.fillText("PINK SHOP", W / 2, 5);
  const money = hooks.money();
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(money), W - 6, 5);
  hooks.icon(ctx, W - 18 - String(money).length * 8, 4);

  // the X (top left)
  ctx.fillStyle = INK;
  ctx.fillRect(CLOSE.x - 1, CLOSE.y - 1, CLOSE.w + 2, CLOSE.h + 2);
  ctx.fillStyle = "#8a1f86";
  ctx.fillRect(CLOSE.x, CLOSE.y, CLOSE.w, CLOSE.h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("X", CLOSE.x + CLOSE.w / 2 + 1, CLOSE.y + 2);

  // the list
  const first = firstRow(rows, ui);
  for (let i = first; i < Math.min(rows.length, first + VIS); i++) {
    const row = rows[i];
    const y = TOP + (i - first) * RH;
    ctx.textAlign = "left";
    if (row.kind === "head") {
      ctx.fillStyle = GOLD;
      ctx.fillText(row.label, LIST_X + 2, y);
      const lx = LIST_X + 2 + row.label.length * 8 + 4;
      ctx.fillStyle = "#6a3a8a";
      ctx.fillRect(lx, y + 3, LIST_X + LIST_W - lx, 1);
      continue;
    }
    const picked = i === ui.index;
    if (picked) {
      ctx.fillStyle = on ? PINK : "#ff5fe0";
      ctx.fillRect(LIST_X, y - 1, LIST_W, RH);
    }
    if (row.kind === "back") {
      ctx.fillStyle = picked ? "#ffffff" : "#e8d0f0";
      ctx.fillText("BACK", LIST_X + 6, y);
      continue;
    }
    const lv = hooks.level(row.id);
    const max = row.prices.length;
    ctx.fillStyle = picked ? "#ffffff" : "#e8d0f0";
    ctx.fillText(row.name, LIST_X + 6, y);
    // an upgrade: little squares for its levels
    if (max > 1) {
      const px = LIST_X + 6 + row.name.length * 8 + 4;
      for (let k = 0; k < max; k++) {
        ctx.fillStyle = INK;
        ctx.fillRect(px + k * 7, y, 6, 6);
        ctx.fillStyle = k < lv ? (picked ? "#ffffff" : "#6fdc5a") : "#4a3060";
        ctx.fillRect(px + k * 7 + 1, y + 1, 4, 4);
      }
    }
    // the right side: the price (gold = you can afford it), or WORN / OWNED / MAX
    ctx.textAlign = "right";
    const rx = LIST_X + LIST_W - 4;
    let tag = "";
    if (lv === 0 && hooks.locked?.(row.id)) tag = "LOCKED";
    else if (row.wear && lv > 0) tag = hooks.worn(row.id) ? "WORN" : "OWNED";
    else if (lv >= max) tag = max > 1 ? "MAX" : "OWNED";
    if (tag) {
      ctx.fillStyle = picked ? "#ffffff" : "#6fdc5a";
      ctx.fillText(tag, rx, y);
    } else {
      const price = row.prices[lv];
      ctx.fillStyle = picked ? "#ffffff" : money >= price ? GOLD : "#c08a9a";
      ctx.fillText(String(price), rx, y);
      hooks.icon(ctx, rx - String(price).length * 8 - 10, y - 1);
    }
  }
  // a little scrollbar when the list is longer than the screen
  if (rows.length > VIS) {
    const bx = LIST_X + LIST_W + 2;
    ctx.fillStyle = "#3a1c54";
    ctx.fillRect(bx, TOP - 1, 2, VIS * RH);
    ctx.fillStyle = "#b46ad8";
    ctx.fillRect(bx, TOP - 1 + Math.round((first / rows.length) * VIS * RH), 2, Math.max(4, Math.round((VIS / rows.length) * VIS * RH)));
  }

  // the preview box (right)
  const b = SHOP_BOX;
  ctx.fillStyle = INK;
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  ctx.fillStyle = "#8a1f86";
  ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
  ctx.fillStyle = "#170a24";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  const row = rows[ui.index];
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  hooks.preview(ctx, row && row.kind === "item" ? row.id : null, b, ui.t);
  ctx.restore();

  // two lines about the highlighted row
  let line1 = o.backLine;
  let line2 = "";
  if (row && row.kind === "item") {
    [line1, line2] = row.info;
    const lv = hooks.level(row.id);
    const max = row.prices.length;
    const lock = lv === 0 ? hooks.locked?.(row.id) : null;
    if (lock) line2 = lock;
    else if (row.wear && lv > 0) line2 = hooks.worn(row.id) ? "YOU'RE WEARING THIS ONE" : o.touch ? "TAP AGAIN TO PUT IT ON" : "PRESS OK TO PUT IT ON";
    else if (lv < max && money < row.prices[lv]) line2 = `YOU NEED ${row.prices[lv] - money} MORE ${hooks.moneyName}`;
  }
  ctx.font = `8px ${font}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(line1, W / 2, 111);
  ctx.fillStyle = "#d8b8e8";
  ctx.fillText(line2, W / 2, 122);

  // a message after buying (flashes pink / white), or how to use the shop
  if (ui.msg && ui.t - ui.msgT < 1.8) {
    const w = ctx.measureText(ui.msg).width + 12;
    const x = Math.round(W / 2 - w / 2);
    const pinkTurn = Math.floor(ui.t * 8) % 2 === 0;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, 133, Math.round(w) + 2, 15);
    ctx.fillStyle = pinkTurn ? PINK : "#ffffff";
    ctx.fillRect(x, 134, Math.round(w), 13);
    ctx.fillStyle = pinkTurn ? "#ffffff" : PINK;
    ctx.fillText(ui.msg, W / 2, 137);
  } else if (Math.floor(ui.t * 2) % 2 === 0) {
    ctx.fillStyle = "#b48ad0";
    ctx.fillText(o.touch ? "TAP = PICK   TAP AGAIN = BUY" : "UP/DOWN = PICK  OK = BUY  ESC = BACK", W / 2, 137);
  }
}

// ---------- the side panels on the start + game over screens ----------
// left: your money, right: a little preview + SHOP. Tap the right one (or press S / DOWN) to open the shop.
export const panelShopHit = (x: number, y: number, W: number) => x > W - 66 && y > 26 && y < 112;

export function drawSidePanels(
  ctx: CanvasRenderingContext2D,
  font: string,
  o: {
    W: number;
    money: number;
    moneyName: string;
    icon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
    touch: boolean;
    preview: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void; // draw something around (cx, cy), about 40 x 40
    t: number;
  }
) {
  const text = (s: string, x: number, y: number, color: string, size = 8) => {
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#000";
    ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
    ctx.fillStyle = color;
    ctx.fillText(s, Math.round(x), Math.round(y));
  };
  // left: your money
  const lx = 38; // (a bit right of the FX slider)
  text(o.moneyName, lx, 44, "#d8b8e8");
  o.icon(ctx, lx - 4, 56);
  text(String(o.money), lx, 68, GOLD, o.money >= 1000 ? 8 : 16);
  // right: preview + SHOP (a box like the ones in the shop)
  const rx = o.W - 33;
  ctx.fillStyle = INK;
  ctx.fillRect(rx - 26, 30, 52, 52);
  ctx.fillStyle = "#8a1f86";
  ctx.fillRect(rx - 25, 31, 50, 50);
  ctx.fillStyle = "#170a24";
  ctx.fillRect(rx - 24, 32, 48, 48);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx - 24, 32, 48, 48);
  ctx.clip();
  o.preview(ctx, rx, 56);
  ctx.restore();
  text("SHOP", rx, 86, Math.floor(o.t * 2) % 2 === 0 ? GOLD : "#ffffff");
  text(o.touch ? "TAP HERE" : "S / DOWN", rx, 98, "#d8b8e8");
}

// ---------- the pause menu every game shares (it looks exactly like PINKMANE VOID's) ----------
// RESUME = keep playing, RESTART = a new run, SHOP = the shop (and back to the paused game),
// GAME MENU = back to the PSP game list (NOT the iPod menu). UP / DOWN pick, OK / SPACE / tap chooses, ESC = resume.
// Games without a shop use PAUSE_ROWS_SIMPLE (no SHOP row).
export const PAUSE_ROWS = ["RESUME", "RESTART", "SHOP", "GAME MENU"] as const;
export const PAUSE_ROWS_SIMPLE = ["RESUME", "RESTART", "GAME MENU"] as const;
export type PauseChoice = "RESUME" | "RESTART" | "SHOP" | "GAME MENU";
const PAUSE_Y0 = 42; // the first row (the same spot as in VOID)
const PAUSE_DY = 14; // how far apart the rows are
const SCREEN = "#d7efbc"; // VOID's pale green

export function drawPauseMenu(
  ctx: CanvasRenderingContext2D,
  font: string,
  o: { W: number; H: number; row: number; t: number; touch: boolean; stats?: string; rows?: readonly string[] }
) {
  const { W, H } = o;
  const rows = o.rows ?? PAUSE_ROWS;
  ctx.fillStyle = "rgba(22, 12, 29, 0.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.font = `8px ${font}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  // a little box with text in it (pink when it's the picked row)
  const box = (text: string, y: number, picked: boolean, pad = 10) => {
    const w = ctx.measureText(text).width + pad;
    ctx.fillStyle = picked ? PINK : SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = picked ? "#ffffff" : INK;
    ctx.fillText(text, W / 2, y);
  };
  box("PAUSED", 26, false, 8);
  rows.forEach((label, i) => {
    const picked = i === o.row;
    box((picked ? "> " : "") + label, PAUSE_Y0 + i * PAUSE_DY, picked);
  });
  if (o.stats) {
    const y = PAUSE_Y0 + rows.length * PAUSE_DY + 4;
    ctx.fillStyle = INK;
    ctx.fillText(o.stats, W / 2 + 1, y + 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(o.stats, W / 2, y);
  }
  if (Math.floor(o.t * 2) % 2 === 0) box(o.touch ? "TAP TO CHOOSE" : "\u2191\u2193 CHOOSE \u00b7 OK CONFIRM", H - 28, false, 8);
}

// which pause row a click / tap is on (-1 = none). n = how many rows that game's menu has.
export function pauseTapRow(x: number, y: number, W: number, n: number = PAUSE_ROWS.length) {
  if (Math.abs(x - W / 2) > 80) return -1;
  const r = Math.floor((y - (PAUSE_Y0 - 2)) / PAUSE_DY);
  return r >= 0 && r < n ? r : -1;
}

// UP / DOWN / OK / ESC on the pause menu. Returns what the key did:
//   "move" (the row changed), "choose" (OK pressed), "resume" (ESC / P), or null (not a pause key)
export function pauseKey(p: { row: number }, n: number, key: string): "move" | "choose" | "resume" | null {
  if (key === "ArrowUp" || key === "w" || key === "W") {
    p.row = (p.row + n - 1) % n;
    return "move";
  }
  if (key === "ArrowDown" || key === "s" || key === "S") {
    p.row = (p.row + 1) % n;
    return "move";
  }
  if (key === "Enter" || key === " ") return "choose";
  if (key === "Escape" || key === "p" || key === "P") return "resume";
  return null;
}

// the small II button the games draw in a corner (phones tap it, computers can click it). x, y = its top left corner.
export const PAUSE_BTN_W = 13;
export const PAUSE_BTN_H = 11;
export function drawPauseButton(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, PAUSE_BTN_W, PAUSE_BTN_H);
  ctx.fillStyle = PINK;
  ctx.fillRect(x + 1, y + 1, PAUSE_BTN_W - 2, PAUSE_BTN_H - 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 4, y + 3, 2, 5);
  ctx.fillRect(x + 7, y + 3, 2, 5);
}
// did a tap at (px, py) hit the II button at (x, y)? (a few pixels extra all round, so it's easy to hit with a thumb)
export const pauseBtnHit = (px: number, py: number, x: number, y: number) =>
  px >= x - 4 && px <= x + PAUSE_BTN_W + 4 && py >= y - 4 && py <= y + PAUSE_BTN_H + 4;

// GAME MENU: leave to the PSP game list, the same way VOID's pause menu does
// (one tiny wait, so the page is listening when the key arrives)
export function leaveToGameMenu() {
  window.setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  }, 0);
}

// =====================================================================================================
// THE REST OF THE KIT every mini game shares, so they all look and feel like one series:
//   text, saved money + shop, shop keys, the start screen, the game over screen, the FX speaker + slider
// =====================================================================================================

// the colours of the start / game over screens
export const KIT = {
  pink: "#ff5fd2",
  green: "#6fdc5a",
  gold: GOLD,
  lilac: "#d8a8ff",
  dim: "#b48ad0",
  hint: "#9a7ab8",
};

// text with a black shadow (8 or 16 pixels high)
export function drawText(
  ctx: CanvasRenderingContext2D,
  font: string,
  s: string,
  x: number,
  y: number,
  color: string,
  size = 8,
  align: CanvasTextAlign = "center"
) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000";
  ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
}

// ---------- SAVED MONEY + SHOP (each game has its own key, so its own money and its own things) ----------
// Item ids look like "group:name" (e.g. "skin:fire", "up:magnet"). Items with wear: true are things you put on:
// one per group is worn at a time. Items with several prices are upgrades with levels.
export type ShopSave = { bank: number; owned: string[]; lv: Record<string, number>; wear: Record<string, string> };

export function makeShop(key: string, rows: ShopRow[]) {
  let d: ShopSave = { bank: 0, owned: [], lv: {}, wear: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw && typeof raw === "object") {
      d = {
        bank: Math.max(0, Math.floor(Number(raw.bank) || 0)),
        owned: Array.isArray(raw.owned) ? raw.owned.filter((x: unknown) => typeof x === "string") : [],
        lv: raw.lv && typeof raw.lv === "object" ? raw.lv : {},
        wear: raw.wear && typeof raw.wear === "object" ? raw.wear : {},
      };
    }
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(d));
    } catch {}
  };
  const items = rows.filter((r): r is Extract<ShopRow, { kind: "item" }> => r.kind === "item");
  const item = (id: string) => items.find((r) => r.id === id);
  const group = (id: string) => id.split(":")[0];
  const firstFree = (g: string) => items.find((r) => r.wear && group(r.id) === g && r.prices[0] === 0)?.id ?? "";
  const level = (id: string) => {
    const r = item(id);
    if (!r) return 0;
    if (r.wear) return r.prices[0] === 0 || d.owned.includes(id) ? 1 : 0;
    return Math.min(r.prices.length, Math.max(0, Math.floor(Number(d.lv[id]) || 0)));
  };
  // what's worn in a group (the free one if nothing else was picked, or if the saved one isn't yours any more)
  const wearing = (g: string) => {
    const w = d.wear[g];
    return w && item(w) && level(w) > 0 ? w : firstFree(g);
  };
  return {
    money: () => d.bank,
    add: (n: number) => {
      if (n > 0) {
        d.bank += Math.floor(n);
        save();
      }
    },
    level,
    // the level of an upgrade by its short name ("up:magnet" -> lvl("magnet"))
    lvl: (name: string) => level(`up:${name}`),
    worn: (id: string) => wearing(group(id)) === id,
    wearing,
    // just the name part of what's worn: wearingName("skin") = "fire"
    wearingName: (g: string) => wearing(g).split(":")[1] ?? "",
    buy: (id: string, price: number) => {
      const r = item(id);
      if (!r) return;
      d.bank -= price;
      if (r.wear) {
        if (!d.owned.includes(id)) d.owned.push(id);
        d.wear[group(id)] = id;
      } else d.lv[id] = level(id) + 1;
      save();
    },
    wear: (id: string) => {
      d.wear[group(id)] = id;
      save();
    },
    // for a game that gives a skin for free (e.g. a mission reward)
    give: (id: string) => {
      if (!d.owned.includes(id)) d.owned.push(id);
      save();
    },
  };
}
export type PinkShopState = ReturnType<typeof makeShop>;

// UP / DOWN / OK / ESC in the shop. Returns "close" when the shop should close, "used" for a shop key, null otherwise.
export function shopKey(rows: ShopRow[], ui: ShopUi, hooks: ShopHooks, key: string): "close" | "used" | null {
  if (key === "ArrowUp" || key === "w" || key === "W") {
    shopMove(rows, ui, -1, hooks);
    return "used";
  }
  if (key === "ArrowDown" || key === "s" || key === "S") {
    shopMove(rows, ui, 1, hooks);
    return "used";
  }
  if (key === "Enter" || key === " ") return shopAct(rows, ui, hooks) === "close" ? "close" : "used";
  if (key === "Escape" || key === "Backspace") return "close";
  return null;
}

// ---------- THE START SCREEN every game shares (not PINKMANE VOID, that one keeps its own) ----------
// title at the top (it bounces to the music), a few lines about the game, START blinking, the #1 / your best,
// a hint line at the bottom. Draw drawSidePanels() after it for the money + SHOP panels.
// Lines in the middle sit between the two panels: on the small iPod screen (256 wide) keep them to about 15 letters.
export function drawStartScreen(
  ctx: CanvasRenderingContext2D,
  font: string,
  o: {
    W: number;
    H: number;
    t: number;
    title: string;
    sub?: string; // a small yellow line under the title
    lines: [string, string][]; // [text, colour], up to 3
    start: string; // e.g. "SPACE = START"
    best?: string; // e.g. "#1 NAME 00123" or "BEST 123"
    hint?: string; // the bottom line (sound keys)
    kick?: number; // 0..1 from the music: the title jumps on the beat
    dim?: number; // how dark the game behind is (0..1), default 0.6
  }
) {
  const { W, H } = o;
  ctx.fillStyle = `rgba(14,4,24,${o.dim ?? 0.6})`;
  ctx.fillRect(0, 0, W, H);
  drawText(ctx, font, o.title, W / 2, 16 - Math.round((o.kick ?? 0) * 2), KIT.pink, 16);
  if (o.sub) drawText(ctx, font, o.sub, W / 2, 36, KIT.gold);
  o.lines.slice(0, 3).forEach(([s, c], i) => drawText(ctx, font, s, W / 2, 54 + i * 12, c));
  const narrow = W < 300; // the small iPod screen: START goes under the SHOP panel's text
  if (Math.floor(o.t * 2) % 2 === 0) drawText(ctx, font, o.start, W / 2, narrow ? 112 : 98, KIT.green);
  if (o.best) drawText(ctx, font, o.best, W / 2, narrow ? 126 : 112, KIT.dim);
  if (o.hint) drawText(ctx, font, o.hint, W / 2, H - 14, KIT.hint);
}

// ---------- THE GAME OVER SCREEN every game shares ----------
// age = seconds since the game ended (it fades in). Draw drawSidePanels() after it.
export function drawOverScreen(
  ctx: CanvasRenderingContext2D,
  font: string,
  o: {
    W: number;
    H: number;
    t: number;
    age: number;
    title: string; // e.g. "GAME OVER" or "BUSTED!"
    score: string; // e.g. "SCORE 1234"
    best: string; // e.g. "BEST 2000"
    newBest: boolean;
    stats?: string; // e.g. "LV 3  42 LEAVES"
    again: string; // e.g. "SPACE = AGAIN"
    saved?: string; // e.g. "+12 LEAVES SAVED"
  }
) {
  const { W, H } = o;
  ctx.fillStyle = `rgba(14,4,24,${Math.min(0.72, o.age * 1.2)})`;
  ctx.fillRect(0, 0, W, H);
  if (o.age < 0.4) return;
  drawText(ctx, font, o.title, W / 2, 18, KIT.pink, 16);
  drawText(ctx, font, o.score, W / 2, 46, KIT.green);
  drawText(ctx, font, o.newBest ? "NEW BEST!" : o.best, W / 2, 58, o.newBest ? KIT.pink : KIT.dim);
  if (o.stats) drawText(ctx, font, o.stats, W / 2, 72, KIT.lilac);
  const narrow = W < 300;
  if (o.age > 0.8 && Math.floor(o.t * 2) % 2 === 0) drawText(ctx, font, o.again, W / 2, narrow ? 112 : 98, KIT.green);
  if (o.saved) drawText(ctx, font, o.saved, W / 2, narrow ? 126 : 112, KIT.green);
}

// ---------- THE FX SPEAKER + SLIDER every game shares (sound effects on / off + how loud) ----------
// The speaker sits in the top left corner, the slider under it (top = loud, bottom = quiet).
// M = on / off, - and + = quieter / louder. Each game saves its own setting.
export type Fx = { on: boolean; vol: number; drag: boolean; key: string };
export const FX_ICON = { x: 4, y: 2, w: 16, h: 12 }; // the area you can click / tap
export const FX_SLIDER = { x: 7, top: 22, bottom: 58 };

export function loadFx(key: string): Fx {
  const fx: Fx = { on: true, vol: 1, drag: false, key };
  try {
    fx.on = localStorage.getItem(key) !== "off";
    const v = localStorage.getItem(key + "-volume");
    if (v !== null && !Number.isNaN(Number(v))) fx.vol = Math.max(0, Math.min(1, Number(v)));
  } catch {}
  return fx;
}
const saveFx = (fx: Fx) => {
  try {
    localStorage.setItem(fx.key, fx.on ? "on" : "off");
    localStorage.setItem(fx.key + "-volume", String(fx.vol));
  } catch {}
};
// moving the slider up from 0 also turns the sounds back on
export function setFxVolume(fx: Fx, v: number) {
  fx.vol = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
  if (fx.vol > 0) fx.on = true;
  saveFx(fx);
}
export function toggleFx(fx: Fx) {
  fx.on = !fx.on;
  if (fx.on && fx.vol <= 0) fx.vol = 0.5;
  saveFx(fx);
}
// how loud a sound should be right now (0 = silent)
export const fxGain = (fx: Fx, muted: boolean) => (muted || !fx.on ? 0 : fx.vol);
// M / - / + : returns true when it was one of those keys
export function fxKey(fx: Fx, key: string) {
  if (key === "m" || key === "M") toggleFx(fx);
  else if (key === "-" || key === "_") setFxVolume(fx, (fx.on ? fx.vol : 0) - 0.1);
  else if (key === "=" || key === "+") setFxVolume(fx, (fx.on ? fx.vol : 0) + 0.1);
  else return false;
  return true;
}
// a click / tap (game pixels): the speaker toggles, the slider starts dragging. slider = is the slider showing?
export function fxTap(fx: Fx, x: number, y: number, slider = true) {
  if (x >= FX_ICON.x && x < FX_ICON.x + FX_ICON.w && y >= FX_ICON.y && y < FX_ICON.y + FX_ICON.h) {
    toggleFx(fx);
    return true;
  }
  if (slider && x < 18 && y >= FX_SLIDER.top - 5 && y <= FX_SLIDER.bottom + 5) {
    fx.drag = true;
    fxDrag(fx, y);
    return true;
  }
  return false;
}
// while dragging: y = where the finger / mouse is. y < 0 = let go.
export function fxDrag(fx: Fx, y: number) {
  if (y < 0) {
    fx.drag = false;
    return;
  }
  if (fx.drag) setFxVolume(fx, (FX_SLIDER.bottom - y) / (FX_SLIDER.bottom - FX_SLIDER.top));
}
// the speaker, with a pink X when the sounds are off. ink = its colour (white on dark games, black on the pale green ones)
export function drawFxIcon(ctx: CanvasRenderingContext2D, fx: Fx, ink = "#ffffff") {
  const x = FX_ICON.x + 3;
  const y = FX_ICON.y + 1;
  ctx.fillStyle = ink;
  ctx.fillRect(x, y + 2, 2, 3);
  ctx.fillRect(x + 2, y + 1, 1, 5);
  ctx.fillRect(x + 3, y, 1, 7);
  if (fx.on && fx.vol > 0) {
    ctx.fillRect(x + 5, y + 2, 1, 3);
    if (fx.vol > 0.5) ctx.fillRect(x + 7, y + 1, 1, 5);
  } else {
    ctx.fillStyle = PINK;
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
      ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
    }
  }
}
// the slider under the speaker. Games show it on the start / game over / pause screens (and while you drag it),
// and hide it while you play so it never covers the game.
export function drawFxSlider(ctx: CanvasRenderingContext2D, font: string, fx: Fx) {
  const { x, top, bottom } = FX_SLIDER;
  const vol = fx.on ? fx.vol : 0;
  const knobY = Math.round(bottom - vol * (bottom - top));
  ctx.globalAlpha = fx.drag ? 1 : 0.8;
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 1, top - 1, 5, bottom - top + 2);
  ctx.fillStyle = "#6e5a8a";
  ctx.fillRect(x, top, 3, bottom - top);
  ctx.fillStyle = PINK;
  ctx.fillRect(x, knobY, 3, bottom - knobY);
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 3, knobY - 2, 9, 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 2, knobY - 1, 7, 3);
  ctx.globalAlpha = 1;
  drawText(ctx, font, "FX", x + 2, top - 9, "#ffffff");
}

// ---------- little sounds made in code (every game can use these instead of its own) ----------
// gain() = how loud (from fxGain). Returns the beep function.
export function makeBeeper(gain: () => number) {
  let ac: AudioContext | null = null;
  const audio = () => {
    if (typeof window === "undefined") return null;
    if (!ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  };
  const beep = (from: number, to: number, time: number, volume: number, type: OscillatorType = "square", delay = 0) => {
    const g0 = gain();
    if (g0 <= 0) return;
    const a = audio();
    if (!a) return;
    try {
      const now = a.currentTime + delay;
      const osc = a.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + time);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.setValueAtTime(volume * g0, now);
      g.gain.exponentialRampToValueAtTime(0.0005, now + time + 0.02);
      osc.connect(g).connect(a.destination);
      osc.start(now);
      osc.stop(now + time + 0.04);
    } catch {}
  };
  return {
    beep,
    wake: () => {
      audio();
    },
    close: () => {
      ac?.close().catch(() => {});
      ac = null;
    },
    // the shop's sounds
    shopSound: (w: "move" | "buy" | "no" | "wear") => {
      if (w === "buy") [660, 880, 1320].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.06));
      else if (w === "no") beep(200, 120, 0.15, 0.06, "square");
      else if (w === "wear") beep(520, 1040, 0.1, 0.05, "square");
      else beep(700, 700, 0.03, 0.03, "square");
    },
  };
}

// ---------- recolouring a pixel picture (skins) ----------
// Repaints the pink parts of a picture with 3 colours (dark, main, light). Used for the outfits.
export function repaintPink(src: CanvasImageSource & { width: number; height: number }, cols: [string, string, string]) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d");
  if (!g) return c;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const rgb = cols.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i];
    const gg = a[i + 1];
    const b = a[i + 2];
    if (a[i + 3] === 0 || !(r > 120 && b > 100 && gg < 140 && r - gg > 50)) continue; // only the pink parts (the hair)
    const l = (r + gg + b) / 765;
    const pick = rgb[l < 0.45 ? 0 : l > 0.75 ? 2 : 1];
    a[i] = pick[0];
    a[i + 1] = pick[1];
    a[i + 2] = pick[2];
  }
  g.putImageData(d, 0, 0);
  return c;
}

// The skin colours every game's shop uses (so "FIRE" looks the same in every game): [dark, main, light]
export const SKIN_COLORS: Record<string, [string, string, string]> = {
  pink: ["#8a1f86", "#d63cc8", "#ff8ae6"],
  toxic: ["#1b6b25", "#3fc24a", "#a8ff8a"],
  ice: ["#2a7ab0", "#7fd0ff", "#e8f8ff"],
  fire: ["#b8320a", "#ff7a00", "#ffd84a"],
  ghost: ["#7a9a90", "#cfe9e0", "#ffffff"],
  shadow: ["#1e1230", "#4a2c6a", "#8a6ab8"],
  gold: ["#a07000", "#ffd700", "#fff3a0"],
};
// rainbow: a colour that keeps changing (i = which piece, so neighbours differ)
export const rainbow = (t: number, i = 0) => `hsl(${Math.round((t * 160 + i * 40) % 360)}, 90%, 60%)`;

// =====================================================================================================
// THE ARCADE CONTROLLER: pause menu + PINK SHOP + FX speaker / slider + the II button, wired up the same way in every game.
// A game makes one inside its game loop effect, then:
//   loop:   arc.tick(dt); if (!arc.frozen()) update(dt); draw(); arc.drawOverlays(ctx, t);
//   keys:   a keydown listener added with { capture: true } that calls arc.key(e) first (if it returns true, stop the key)
//   taps:   if (arc.tap(x, y)) return;   (x, y in game pixels)   and arc.drag(y) while the finger / mouse moves (-1 = let go)
//   OK:     if (arc.ok()) return;  before the game's own OK / SPACE / A handling
//   panels: arc.drawPanels(ctx, t) on the start + game over screens (money left, SHOP right)
// =====================================================================================================
export type ArcadeOpts = {
  W: number;
  H: number;
  font: string;
  fxKey: string; // where this game saves its FX setting
  shopKey: string; // where this game saves its money + shop
  rows: ShopRow[];
  moneyName: string;
  icon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void; // the money, 8 x 8
  preview: (ctx: CanvasRenderingContext2D, id: string | null, box: ShopBox, t: number) => void; // the shop's preview box
  panelPreview: (ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) => void; // the SHOP panel's picture
  ink?: string; // the speaker's colour
  muted: () => boolean;
  touch: () => boolean;
  playing: () => boolean; // a run is going (the II button shows, the FX slider hides)
  menuScreen: () => boolean; // the start or game over screen is up (the side panels + shop work)
  busy?: () => boolean; // e.g. the Top 10 box is open: no pause, no shop
  restart: () => void; // RESTART on the pause menu
  leaving?: () => void; // called before RESTART / GAME MENU (save the money from this run)
  stats?: () => string; // the line under the pause menu
  pauseBtn?: { x: number; y: number }; // where the II button goes
  backLine?: string; // what the shop's info line says on BACK
};

export function makeArcade(o: ArcadeOpts) {
  const fx = loadFx(o.fxKey);
  const shop = makeShop(o.shopKey, o.rows);
  const sound = makeBeeper(() => fxGain(fx, o.muted()));
  const pause = { on: false, row: 0, t: 0 };
  const shopUi = { open: false, from: "start" as "start" | "pause", ui: newShopUi(o.rows) };
  const busy = () => o.busy?.() ?? false;
  const hooks: ShopHooks = {
    money: shop.money,
    moneyName: o.moneyName,
    icon: o.icon,
    level: shop.level,
    worn: shop.worn,
    buy: shop.buy,
    wear: shop.wear,
    preview: o.preview,
    sound: sound.shopSound,
  };
  const setPause = (on: boolean) => {
    if (on && (busy() || pause.on)) return;
    pause.on = on;
    pause.row = 0;
    sound.beep(on ? 600 : 400, on ? 300 : 800, 0.1, 0.04);
  };
  const openShop = (from: "start" | "pause") => {
    shopUi.open = true;
    shopUi.from = from;
    shopUi.ui.msg = "";
    sound.shopSound("move");
  };
  const closeShop = () => {
    shopUi.open = false;
    sound.shopSound("move");
  };
  const pauseChoose = () => {
    const pick = PAUSE_ROWS[pause.row];
    if (pick === "SHOP") {
      openShop("pause");
      return;
    }
    pause.on = false;
    if (pick === "RESUME") sound.beep(400, 800, 0.1, 0.04);
    else if (pick === "RESTART") {
      o.leaving?.();
      o.restart();
    } else {
      o.leaving?.();
      leaveToGameMenu();
    }
  };
  const sliderShown = () => !o.playing() || pause.on || fx.drag;
  return {
    fx,
    shop,
    hooks,
    beep: sound.beep,
    wakeSound: sound.wake,
    closeSound: sound.close,
    pause,
    shopUi,
    setPause,
    openShop,
    frozen: () => pause.on || shopUi.open,
    tick: (dt: number) => {
      pause.t += dt;
      if (shopUi.open) shopUi.ui.t += dt;
    },
    // a key (from a keydown listener added with capture: true). true = it was used, the game and page should ignore it.
    key: (e: KeyboardEvent): boolean => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return false;
      const k = e.key;
      if (shopUi.open) {
        if (fxKey(fx, k)) return true;
        if (e.repeat && (k === "Enter" || k === " ")) return true;
        const r = shopKey(o.rows, shopUi.ui, hooks, k);
        if (r === "close") closeShop();
        return k !== "Backspace" || r === "close";
      }
      if (pause.on) {
        if (k === "Backspace") return false; // the page takes you back to the game list
        if (fxKey(fx, k)) return true;
        const did = pauseKey(pause, PAUSE_ROWS.length, k);
        if (did === "move") sound.beep(700, 700, 0.03, 0.03);
        else if (did === "choose" && !e.repeat) pauseChoose();
        else if (did === "resume" && !e.repeat) setPause(false);
        return true; // (nothing else happens while paused)
      }
      if (fxKey(fx, k)) return true;
      if ((k === "Escape" || k === "p" || k === "P") && !busy()) {
        setPause(true);
        return true;
      }
      if ((k === "s" || k === "S" || k === "ArrowDown") && o.menuScreen() && !busy()) {
        openShop("start");
        return true;
      }
      return false;
    },
    // a click / tap in game pixels. true = it was used here.
    tap: (x: number, y: number): boolean => {
      if (shopUi.open) {
        if (shopTap(o.rows, shopUi.ui, hooks, x, y) === "close") closeShop();
        return true;
      }
      if (fxTap(fx, x, y, sliderShown())) return true;
      if (pause.on) {
        const r = pauseTapRow(x, y, o.W, PAUSE_ROWS.length);
        if (r >= 0) {
          pause.row = r;
          pauseChoose();
        }
        return true;
      }
      if (o.pauseBtn && o.playing() && pauseBtnHit(x, y, o.pauseBtn.x, o.pauseBtn.y)) {
        setPause(true);
        return true;
      }
      if (o.menuScreen() && !busy() && panelShopHit(x, y, o.W)) {
        openShop("start");
        return true;
      }
      return false;
    },
    drag: (y: number) => fxDrag(fx, y),
    dragging: () => fx.drag,
    // OK / SPACE / A from the page while the pause menu or the shop is open. true = used.
    ok: (): boolean => {
      if (shopUi.open) {
        if (shopAct(o.rows, shopUi.ui, hooks) === "close") closeShop();
        return true;
      }
      if (pause.on) {
        pauseChoose();
        return true;
      }
      return false;
    },
    drawPanels: (ctx: CanvasRenderingContext2D, t: number) =>
      drawSidePanels(ctx, o.font, {
        W: o.W,
        money: shop.money(),
        moneyName: o.moneyName,
        icon: o.icon,
        touch: o.touch(),
        t,
        preview: (c, cx, cy) => o.panelPreview(c, cx, cy, t),
      }),
    drawOverlays: (ctx: CanvasRenderingContext2D, t: number) => {
      void t;
      if (shopUi.open) {
        drawPinkShop(ctx, o.font, o.rows, shopUi.ui, hooks, {
          W: o.W,
          H: o.H,
          touch: o.touch(),
          backLine: shopUi.from === "pause" ? "BACK TO YOUR GAME" : o.backLine ?? "BACK TO THE START SCREEN",
        });
        return;
      }
      if (pause.on) {
        drawPauseMenu(ctx, o.font, { W: o.W, H: o.H, row: pause.row, t: pause.t, touch: o.touch(), stats: o.stats?.() });
        drawFxIcon(ctx, fx, "#ffffff");
        drawFxSlider(ctx, o.font, fx);
        return;
      }
      drawFxIcon(ctx, fx, o.playing() ? o.ink ?? "#ffffff" : "#ffffff");
      if (sliderShown()) drawFxSlider(ctx, o.font, fx);
      if (o.pauseBtn && o.playing()) drawPauseButton(ctx, o.pauseBtn.x, o.pauseBtn.y);
    },
  };
}
export type Arcade = ReturnType<typeof makeArcade>;
