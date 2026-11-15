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
    if (row.wear && lv > 0) tag = hooks.worn(row.id) ? "WORN" : "OWNED";
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
    if (row.wear && lv > 0) line2 = hooks.worn(row.id) ? "YOU'RE WEARING THIS ONE" : o.touch ? "TAP AGAIN TO PUT IT ON" : "PRESS OK TO PUT IT ON";
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
  const lx = 33;
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

// ---------- the pause menu every game shares ----------
// RESUME = keep playing, RESTART = a new run, SHOP = the shop (and back to the paused game), GAME MENU = this game's
// own start screen (NOT the iPod menu). UP / DOWN pick, OK / SPACE / tap chooses, ESC = resume.
export const PAUSE_ROWS = ["RESUME", "RESTART", "SHOP", "GAME MENU"] as const;
export type PauseChoice = (typeof PAUSE_ROWS)[number];
const PAUSE_Y0 = 40;
const PAUSE_DY = 16;
const PAUSE_W = 132;

export function drawPauseMenu(
  ctx: CanvasRenderingContext2D,
  font: string,
  o: { W: number; H: number; row: number; t: number; touch: boolean; stats: string }
) {
  const { W, H } = o;
  ctx.fillStyle = "rgba(14,4,24,0.82)";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.font = `16px ${font}`;
  ctx.fillStyle = INK;
  ctx.fillText("PAUSED", W / 2 + 1, 13);
  ctx.fillStyle = "#ff5fd2";
  ctx.fillText("PAUSED", W / 2, 12);
  ctx.font = `8px ${font}`;
  const on = Math.floor(o.t * 3) % 2 === 0;
  PAUSE_ROWS.forEach((label, i) => {
    const y = PAUSE_Y0 + i * PAUSE_DY;
    const picked = i === o.row;
    const x = Math.round(W / 2 - PAUSE_W / 2);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 4, PAUSE_W + 2, 14);
    ctx.fillStyle = picked ? (on ? PINK : "#ff5fe0") : "#2a1040";
    ctx.fillRect(x, y - 3, PAUSE_W, 12);
    ctx.fillStyle = picked ? "#ffffff" : "#e8d0f0";
    ctx.fillText(picked ? `> ${label} <` : label, W / 2, y);
  });
  ctx.fillStyle = "#d8b8e8";
  ctx.fillText(o.stats, W / 2, PAUSE_Y0 + PAUSE_ROWS.length * PAUSE_DY + 4);
  ctx.fillStyle = "#9a7ab8";
  ctx.fillText(o.touch ? "TAP TO CHOOSE" : "UP/DOWN + OK   ESC = RESUME", W / 2, H - 13);
}

// which pause row a click / tap is on (-1 = none)
export function pauseTapRow(x: number, y: number, W: number) {
  if (Math.abs(x - W / 2) > PAUSE_W / 2 + 4) return -1;
  for (let i = 0; i < PAUSE_ROWS.length; i++) {
    const ry = PAUSE_Y0 + i * PAUSE_DY;
    if (y >= ry - 5 && y < ry + 11) return i;
  }
  return -1;
}
