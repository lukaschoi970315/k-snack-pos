import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "k_snack_pos.db");

// ---------- Utility Helpers ----------
function getManilaDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getManilaTimestamp() {
  return new Date().toISOString();
}

function hashPin(pin) {
  return crypto.createHash("sha256").update(`ksnack-ph:${String(pin)}`).digest("hex");
}

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function parseJsonSafe(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": contentType, ...extraHeaders });
  res.end(text);
}

async function readBody(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

// ---------- SQLite Initialization & Seed ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'school_stall', -- 'school_stall' | 'shop_kiosk'
    default_mode TEXT NOT NULL DEFAULT 'pos',   -- 'pos' | 'kiosk'
    opening_float INTEGER NOT NULL DEFAULT 2500,
    gcash_number TEXT NOT NULL DEFAULT '',
    qr_image_url TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    name_ko TEXT NOT NULL,
    name_en TEXT NOT NULL,
    unit TEXT NOT NULL,
    default_daily_qty INTEGER NOT NULL DEFAULT 100,
    sort_order INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS branch_inventory_allocations (
    branch_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    opening_qty INTEGER NOT NULL DEFAULT 0,
    approved_waste_qty INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (branch_id, business_date, inventory_item_id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name_ko TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_tl TEXT NOT NULL DEFAULT '',
    description_en TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    is_quick_combo INTEGER NOT NULL DEFAULT 0,
    options_json TEXT NOT NULL DEFAULT '[]',
    consumes_json TEXT NOT NULL DEFAULT '[]',
    is_available INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number INTEGER NOT NULL,
    branch_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    source_mode TEXT NOT NULL,       -- 'pos' | 'kiosk' | 'table_qr'
    table_label TEXT NOT NULL DEFAULT 'Counter',
    items_json TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL,    -- 'cash' | 'gcash' | 'card' | 'punch_card'
    payment_status TEXT NOT NULL,    -- 'unpaid' | 'paid' | 'void_requested' | 'voided'
    order_status TEXT NOT NULL,      -- 'waiting_payment' | 'preparing' | 'ready' | 'completed' | 'voided'
    cash_received INTEGER,
    change_given INTEGER,
    punch_card_code TEXT,
    paymongo_ref TEXT,
    bir_si_required INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    paid_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_branch_date ON orders(branch_id, business_date);

  CREATE TABLE IF NOT EXISTS order_consumptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    qty INTEGER NOT NULL,
    is_voided INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_consumptions_branch_date ON order_consumptions(branch_id, business_date);

  CREATE TABLE IF NOT EXISTS void_requests (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    staff_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    requested_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS blind_closeouts (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    denominations_json TEXT NOT NULL,
    counted_cash_total INTEGER NOT NULL,
    remaining_stock_json TEXT NOT NULL,
    reported_waste_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS punch_cards (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    branch_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    student_name TEXT NOT NULL,
    package_price INTEGER NOT NULL,
    total_punches INTEGER NOT NULL,
    remaining_punches INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    summary TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
`);

function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

function ensureSetting(key, defaultValue) {
  const existing = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, String(defaultValue));
  }
}

function logAudit(branchId, eventType, actorRole, summary, details = {}) {
  db.prepare(
    "INSERT INTO audit_logs (branch_id, event_type, actor_role, summary, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(branchId || "all", eventType, actorRole, summary, JSON.stringify(details), getManilaTimestamp());
}

function ensureDailyAllocations(branchId, businessDate) {
  const items = db.prepare("SELECT id, default_daily_qty FROM inventory_items").all();
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO branch_inventory_allocations
      (branch_id, business_date, inventory_item_id, opening_qty, approved_waste_qty, notes, updated_at)
    VALUES (?, ?, ?, ?, 0, '일일 기본 배급', ?)
  `);
  const now = getManilaTimestamp();
  for (const item of items) {
    insertStmt.run(branchId, businessDate, item.id, item.default_daily_qty, now);
  }
}

function seedDatabase() {
  ensureSetting("owner_pin_hash", hashPin("7777"));
  ensureSetting("shop_name", "HM Snacks");
  ensureSetting("telegram_bot_token", "");
  ensureSetting("telegram_chat_id", "");
  ensureSetting("paymongo_mode", "manual_qr"); // 'manual_qr' | 'paymongo_dynamic'
  ensureSetting("paymongo_secret_key", "");
  ensureSetting("paymongo_webhook_secret", "");
  ensureSetting("bir_tin", "123-456-789-000");
  ensureSetting("bir_vat_threshold", "3000000");
  ensureSetting("signage_gcash_name", "HM Snacks");
  ensureSetting("signage_gcash_number", "0917-000-8899");

  const branchCount = db.prepare("SELECT COUNT(*) AS cnt FROM branches").get().cnt;
  if (branchCount === 0) {
    const now = getManilaTimestamp();
    const insertBranch = db.prepare(`
      INSERT INTO branches (id, name, type, default_mode, opening_float, gcash_number, qr_image_url, is_active, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    insertBranch.run("school-a", "1호점 · 학교 칸틴 앞 (Branch 1)", "school_stall", "pos", 2500, "0917-101-7777", "", 1, now);
    insertBranch.run("school-b", "2호점 · 학교 정문 부스 (Branch 2)", "school_stall", "pos", 2500, "0917-202-7777", "", 2, now);
    insertBranch.run("univ-main", "3호점 · 로드샵 키오스크 (Branch 3)", "shop_kiosk", "kiosk", 3000, "0917-303-7777", "", 3, now);
  }

  const invCount = db.prepare("SELECT COUNT(*) AS cnt FROM inventory_items").get().cnt;
  if (invCount === 0) {
    const insertInv = db.prepare(`
      INSERT INTO inventory_items (id, name_ko, name_en, unit, default_daily_qty, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertInv.run("skewer_eomuk", "어묵 꼬치", "Eomuk Skewers", "꼬치", 150, 1);
    insertInv.run("bowl_cupbap", "컵밥 전용 용기", "Cupbap Bowls", "개", 80, 2);
    insertInv.run("bowl_ramyun", "라면 전용 용기", "Ramyun Bowls", "개", 50, 3);
    insertInv.run("cup_tteok", "떡볶이 컵", "Tteokbokki Cups", "개", 60, 4);
    insertInv.run("can_drink", "음료 캔/병", "Drink Cans/Bottles", "캔", 100, 5);
  }

  const today = getManilaDate();
  const branches = db.prepare("SELECT id FROM branches").all();
  for (const b of branches) ensureDailyAllocations(b.id, today);
}

seedDatabase();

// ---------- SSE Broadcast ----------
const sseClients = new Set();
function broadcastEvent(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (!client.branchId || client.branchId === "all" || !data.branchId || client.branchId === data.branchId) {
      try {
        client.res.write(msg);
      } catch {
        sseClients.delete(client);
      }
    }
  }
}

// ---------- Telegram Notification (Graceful async) ----------
async function sendTelegramAlert(text) {
  const token = getSetting("telegram_bot_token", "").trim();
  const chatId = getSetting("telegram_chat_id", "").trim();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("[Telegram Alert Error]", err.message);
  }
}

// ---------- Auth Helper ----------
function verifyOwnerPin(pin) {
  if (!pin) return false;
  const expectedHash = getSetting("owner_pin_hash");
  return safeEqualHex(hashPin(pin), expectedHash);
}

function getPinFromReq(req, urlObj, body = {}) {
  return req.headers["x-owner-pin"] || urlObj.searchParams.get("pin") || body.pin || "";
}

// ---------- Core Business Calculations ----------
function buildOrderPricing(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("EMPTY_CART");
  }
  const getMenu = db.prepare("SELECT * FROM menu_items WHERE id = ?");
  const items = [];
  const consumptionTotals = new Map();
  let totalAmount = 0;

  for (const entry of rawItems) {
    const qty = Math.max(1, Math.min(50, Math.floor(Number(entry.qty || 1))));
    const menu = getMenu.get(String(entry.menuItemId || ""));
    if (!menu || !menu.is_available) {
      throw new Error(`INVALID_MENU_ITEM:${entry.menuItemId}`);
    }

    const optionGroups = parseJsonSafe(menu.options_json, []);
    const selectedChoices = [];
    let optionDelta = 0;

    if (Array.isArray(entry.selectedOptions)) {
      for (const sel of entry.selectedOptions) {
        const grp = optionGroups.find((g) => g.id === sel.groupId);
        if (!grp) continue;
        const ch = (grp.choices || []).find((c) => c.id === sel.optionId);
        if (!ch) continue;
        optionDelta += Number(ch.priceDelta || 0);
        selectedChoices.push({
          groupId: grp.id,
          optionId: ch.id,
          label_ko: ch.label_ko,
          label_en: ch.label_en,
          priceDelta: Number(ch.priceDelta || 0),
        });
      }
    }

    const unitPrice = Number(menu.price) + optionDelta;
    const lineTotal = unitPrice * qty;
    totalAmount += lineTotal;

    const consumes = parseJsonSafe(menu.consumes_json, []);
    for (const c of consumes) {
      const addQty = Number(c.qty || 0) * qty;
      if (addQty > 0) {
        consumptionTotals.set(
          c.inventory_item_id,
          (consumptionTotals.get(c.inventory_item_id) || 0) + addQty
        );
      }
    }

    items.push({
      menuItemId: menu.id,
      name_ko: menu.name_ko,
      name_en: menu.name_en,
      qty,
      unitPrice,
      lineTotal,
      optionsLabel: selectedChoices.map((c) => c.label_en).join(", "),
      selectedChoices,
      consumes,
    });
  }

  return {
    items,
    totalAmount,
    consumptions: Array.from(consumptionTotals.entries()).map(([inventory_item_id, qty]) => ({
      inventory_item_id,
      qty,
    })),
  };
}

function recordOrderConsumptions(order) {
  const existing = db.prepare("SELECT COUNT(*) AS cnt FROM order_consumptions WHERE order_id = ?").get(order.id).cnt;
  if (existing > 0) return;
  const items = parseJsonSafe(order.items_json, []);
  const ins = db.prepare(
    "INSERT INTO order_consumptions (order_id, branch_id, business_date, inventory_item_id, qty, is_voided) VALUES (?, ?, ?, ?, ?, 0)"
  );
  for (const it of items) {
    const qty = Number(it.qty || 1);
    for (const c of it.consumes || []) {
      const totalC = Number(c.qty || 0) * qty;
      if (totalC > 0) ins.run(order.id, order.branch_id, order.business_date, c.inventory_item_id, totalC);
    }
  }
}

function computeBranchReconciliation(branchId, businessDate) {
  const branch = db.prepare("SELECT * FROM branches WHERE id = ?").get(branchId);
  if (!branch) return null;
  ensureDailyAllocations(branchId, businessDate);

  const orders = db
    .prepare("SELECT * FROM orders WHERE branch_id = ? AND business_date = ? ORDER BY created_at DESC")
    .all(branchId, businessDate);

  const paidOrders = orders.filter((o) => o.payment_status === "paid" || o.payment_status === "void_requested");
  const voidedOrders = orders.filter((o) => o.payment_status === "voided");
  const unpaidOrders = orders.filter((o) => o.payment_status === "unpaid");

  const cashOrderSales = paidOrders.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total_amount, 0);
  const gcashOrderSales = paidOrders.filter((o) => o.payment_method === "gcash").reduce((s, o) => s + o.total_amount, 0);
  const cardOrderSales = paidOrders.filter((o) => o.payment_method === "card").reduce((s, o) => s + o.total_amount, 0);
  const punchCardRedeemedValue = paidOrders
    .filter((o) => o.payment_method === "punch_card")
    .reduce((s, o) => s + o.total_amount, 0);

  // Punch card sales collected today (adds cash/gcash to physical drawer/QR!)
  const pcSales = db
    .prepare("SELECT * FROM punch_cards WHERE branch_id = ? AND business_date = ?")
    .all(branchId, businessDate);
  const punchCardCashSales = pcSales.filter((p) => p.payment_method === "cash").reduce((s, p) => s + p.package_price, 0);
  const punchCardGcashSales = pcSales.filter((p) => p.payment_method === "gcash").reduce((s, p) => s + p.package_price, 0);

  const expectedCashSales = cashOrderSales + punchCardCashSales;
  const expectedGcashSales = gcashOrderSales + punchCardGcashSales;
  const grossSales = expectedCashSales + expectedGcashSales + cardOrderSales;
  const expectedDrawerCash = branch.opening_float + expectedCashSales;

  const latestCloseout = db
    .prepare("SELECT * FROM blind_closeouts WHERE branch_id = ? AND business_date = ? ORDER BY submitted_at DESC LIMIT 1")
    .get(branchId, businessDate);

  const cashOverShort = latestCloseout ? latestCloseout.counted_cash_total - expectedDrawerCash : null;

  // 1:1 Inventory Audit
  const invItems = db.prepare("SELECT * FROM inventory_items ORDER BY sort_order ASC").all();
  const allocs = db
    .prepare("SELECT * FROM branch_inventory_allocations WHERE branch_id = ? AND business_date = ?")
    .all(branchId, businessDate);
  const soldRows = db
    .prepare(`
      SELECT inventory_item_id, COALESCE(SUM(qty), 0) AS sold_qty
      FROM order_consumptions
      WHERE branch_id = ? AND business_date = ? AND is_voided = 0
      GROUP BY inventory_item_id
    `)
    .all(branchId, businessDate);

  const soldMap = new Map(soldRows.map((r) => [r.inventory_item_id, Number(r.sold_qty)]));
  const allocMap = new Map(allocs.map((a) => [a.inventory_item_id, a]));
  const closeStock = latestCloseout ? parseJsonSafe(latestCloseout.remaining_stock_json, {}) : null;
  const closeWaste = latestCloseout ? parseJsonSafe(latestCloseout.reported_waste_json, {}) : null;

  const inventoryAudit = invItems.map((item) => {
    const alloc = allocMap.get(item.id) || { opening_qty: item.default_daily_qty, approved_waste_qty: 0 };
    const soldQty = soldMap.get(item.id) || 0;
    const expectedRemaining = alloc.opening_qty - alloc.approved_waste_qty - soldQty;
    const reportedRemaining = closeStock && closeStock[item.id] !== undefined ? Number(closeStock[item.id]) : null;
    const staffReportedWaste = closeWaste && closeWaste[item.id] !== undefined ? Number(closeWaste[item.id]) : 0;
    const variance = reportedRemaining !== null ? reportedRemaining - expectedRemaining : null;
    return {
      inventoryItemId: item.id,
      name_ko: item.name_ko,
      name_en: item.name_en,
      unit: item.unit,
      openingQty: alloc.opening_qty,
      approvedWasteQty: alloc.approved_waste_qty,
      soldQty,
      expectedRemaining,
      reportedRemaining,
      staffReportedWaste,
      variance,
    };
  });

  const hasCashDiscrepancy = cashOverShort !== null && Math.abs(cashOverShort) >= 20;
  const hasStockDiscrepancy = inventoryAudit.some((i) => i.variance !== null && i.variance !== 0);

  return {
    branch,
    businessDate,
    metrics: {
      paidOrderCount: paidOrders.length,
      unpaidOrderCount: unpaidOrders.length,
      voidedOrderCount: voidedOrders.length,
      cashOrderSales,
      punchCardCashSales,
      expectedCashSales,
      expectedGcashSales,
      cardOrderSales,
      punchCardRedeemedValue,
      grossSales,
      openingFloat: branch.opening_float,
      expectedDrawerCash,
      countedCashTotal: latestCloseout ? latestCloseout.counted_cash_total : null,
      cashOverShort,
      birSiOrdersCount: paidOrders.filter((o) => o.bir_si_required === 1).length,
    },
    latestCloseout: latestCloseout
      ? {
          id: latestCloseout.id,
          staffName: latestCloseout.staff_name,
          denominations: parseJsonSafe(latestCloseout.denominations_json, {}),
          countedCashTotal: latestCloseout.counted_cash_total,
          notes: latestCloseout.notes,
          submittedAt: latestCloseout.submitted_at,
        }
      : null,
    inventoryAudit,
    alerts: {
      hasCashDiscrepancy,
      hasStockDiscrepancy,
      flagged: hasCashDiscrepancy || hasStockDiscrepancy,
    },
  };
}

function formatOrderForClient(row) {
  return {
    ...row,
    items: parseJsonSafe(row.items_json, []),
    bir_si_required: Boolean(row.bir_si_required),
  };
}

// ---------- HTTP Router ----------
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;

  try {
    // 1. SSE Real-time Stream
    if (req.method === "GET" && pathname === "/api/stream") {
      const branchId = urlObj.searchParams.get("branchId") || "all";
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, branchId, ts: getManilaTimestamp() })}\n\n`);
      const client = { res, branchId };
      sseClients.add(client);
      const ping = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(ping);
          sseClients.delete(client);
        }
      }, 25000);
      req.on("close", () => {
        clearInterval(ping);
        sseClients.delete(client);
      });
      return;
    }

    // 2. Public Bootstrap (ZERO sensitive settings or expected cash/stock)
    if (req.method === "GET" && pathname === "/api/bootstrap") {
      const branches = db.prepare("SELECT id, name, type, default_mode, gcash_number, qr_image_url, is_active, sort_order FROM branches WHERE is_active = 1 ORDER BY sort_order ASC").all();
      const inventoryItems = db.prepare("SELECT id, name_ko, name_en, unit, sort_order FROM inventory_items ORDER BY sort_order ASC").all();
      const menuRows = db.prepare("SELECT * FROM menu_items ORDER BY sort_order ASC").all();
      const menuItems = menuRows.map((m) => ({
        ...m,
        is_quick_combo: Boolean(m.is_quick_combo),
        is_available: Boolean(m.is_available),
        options: parseJsonSafe(m.options_json, []),
        consumes: parseJsonSafe(m.consumes_json, []),
      }));

      return sendJson(res, 200, {
        ok: true,
        businessDate: getManilaDate(),
        shopName: getSetting("shop_name", "HM Snacks"),
        paymongoMode: getSetting("paymongo_mode", "manual_qr"),
        paymongoConfigured: Boolean(getSetting("paymongo_secret_key", "").trim()),
        signageGcashName: getSetting("signage_gcash_name", "HM Snacks"),
        signageGcashNumber: getSetting("signage_gcash_number", "0917-000-8899"),
        branches,
        inventoryItems,
        menuItems,
      });
    }

    // 3. Orders List
    if (req.method === "GET" && pathname === "/api/orders") {
      const branchId = urlObj.searchParams.get("branchId") || "school-a";
      const businessDate = urlObj.searchParams.get("date") || getManilaDate();
      const rows =
        branchId === "all"
          ? db.prepare("SELECT * FROM orders WHERE business_date = ? ORDER BY created_at DESC LIMIT 200").all(businessDate)
          : db
              .prepare("SELECT * FROM orders WHERE branch_id = ? AND business_date = ? ORDER BY created_at DESC LIMIT 200")
              .all(branchId, businessDate);
      return sendJson(res, 200, { ok: true, businessDate, orders: rows.map(formatOrderForClient) });
    }

    // 4. Create Order (Server validates prices & inventory mapping)
    if (req.method === "POST" && pathname === "/api/orders") {
      const body = await readJsonBody(req);
      const branchId = String(body.branchId || "school-a");
      const branch = db.prepare("SELECT * FROM branches WHERE id = ? AND is_active = 1").get(branchId);
      if (!branch) return sendJson(res, 400, { ok: false, error: "존재하지 않는 지점입니다." });

      const sourceMode = ["pos", "kiosk", "table_qr"].includes(body.sourceMode) ? body.sourceMode : "kiosk";
      const paymentMethod = ["cash", "gcash", "card", "punch_card"].includes(body.paymentMethod)
        ? body.paymentMethod
        : "cash";
      const tableLabel = String(body.tableLabel || (sourceMode === "pos" ? "Counter" : "Kiosk")).slice(0, 32);

      let pricing;
      try {
        pricing = buildOrderPricing(body.items);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: `주문 항목 오류: ${err.message}` });
      }

      const businessDate = getManilaDate();
      ensureDailyAllocations(branchId, businessDate);

      let cashReceived = null;
      let changeGiven = null;
      let punchCardCode = null;
      let paymentStatus = "unpaid";
      let orderStatus = "waiting_payment";
      let paidAt = null;
      let completedAt = null;
      const now = getManilaTimestamp();

      // Determine payment & status transition
      if (paymentMethod === "punch_card") {
        const code = String(body.punchCardCode || "").trim().toUpperCase();
        const pc = db.prepare("SELECT * FROM punch_cards WHERE UPPER(code) = ?").get(code);
        if (!pc) return sendJson(res, 400, { ok: false, error: `식권 번호(${code})를 찾을 수 없습니다.` });
        const neededPunches = Math.max(1, Math.ceil(pricing.totalAmount / 50));
        if (pc.remaining_punches < neededPunches) {
          return sendJson(res, 400, {
            ok: false,
            error: `잔여 식권 횟수 부족 (필요: ${neededPunches}칸 / 남은 횟수: ${pc.remaining_punches}칸)`,
          });
        }
        punchCardCode = pc.code;
        db.prepare("UPDATE punch_cards SET remaining_punches = remaining_punches - ? WHERE id = ?").run(
          neededPunches,
          pc.id
        );
        paymentStatus = "paid";
        orderStatus = body.instantComplete ? "completed" : "preparing";
        paidAt = now;
        if (orderStatus === "completed") completedAt = now;
      } else if (sourceMode === "pos") {
        // Staff POS confirms payment on the spot!
        if (paymentMethod === "cash") {
          const tendered = Number(body.cashReceived ?? pricing.totalAmount);
          if (!Number.isFinite(tendered) || tendered < pricing.totalAmount) {
            return sendJson(res, 400, { ok: false, error: "받은 현금이 결제 금액보다 적습니다." });
          }
          cashReceived = Math.round(tendered);
          changeGiven = cashReceived - pricing.totalAmount;
        }
        paymentStatus = "paid";
        orderStatus = body.instantComplete ? "completed" : "preparing";
        paidAt = now;
        if (orderStatus === "completed") completedAt = now;
      }

      const maxNum = db
        .prepare("SELECT COALESCE(MAX(order_number), 100) AS m FROM orders WHERE branch_id = ? AND business_date = ?")
        .get(branchId, businessDate).m;
      const orderNumber = maxNum + 1;
      const orderId = `ord_${crypto.randomUUID().slice(0, 10)}`;
      const birSiRequired = pricing.totalAmount >= 500 ? 1 : 0;

      db.exec("BEGIN");
      try {
        db.prepare(`
          INSERT INTO orders (
            id, order_number, branch_id, business_date, source_mode, table_label,
            items_json, total_amount, payment_method, payment_status, order_status,
            cash_received, change_given, punch_card_code, bir_si_required, created_at, paid_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderId,
          orderNumber,
          branchId,
          businessDate,
          sourceMode,
          tableLabel,
          JSON.stringify(pricing.items),
          pricing.totalAmount,
          paymentMethod,
          paymentStatus,
          orderStatus,
          cashReceived,
          changeGiven,
          punchCardCode,
          birSiRequired,
          now,
          paidAt,
          completedAt
        );

        if (paymentStatus === "paid") {
          const insC = db.prepare(
            "INSERT INTO order_consumptions (order_id, branch_id, business_date, inventory_item_id, qty, is_voided) VALUES (?, ?, ?, ?, ?, 0)"
          );
          for (const c of pricing.consumptions) {
            insC.run(orderId, branchId, businessDate, c.inventory_item_id, c.qty);
          }
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }

      const created = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId));
      logAudit(branchId, "ORDER_CREATED", sourceMode, `주문 #${orderNumber} (${paymentMethod}, ₱${pricing.totalAmount})`, {
        orderId,
        paymentStatus,
      });

      if (birSiRequired) {
        sendTelegramAlert(
          `⚠️ [₱500+ 수기 SI 발행 필요]\n지점: ${branch.name}\n주문: #${orderNumber} (₱${pricing.totalAmount})\nBIR 규정상 요청 시 수기 Sales Invoice 책자를 발행해 주세요.`
        );
      }

      broadcastEvent("order_created", { branchId, order: created });
      return sendJson(res, 201, { ok: true, order: created });
    }

    // 5. Confirm Payment (Cash Drop-Box Verified or Soundbox GCash/Card Verified)
    const confirmMatch = pathname.match(/^\/api\/orders\/([^/]+)\/confirm-payment$/);
    if (req.method === "POST" && confirmMatch) {
      const orderId = confirmMatch[1];
      const body = await readJsonBody(req);
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) return sendJson(res, 404, { ok: false, error: "주문을 찾을 수 없습니다." });
      if (order.payment_status === "voided") {
        return sendJson(res, 400, { ok: false, error: "이미 취소(Void)된 주문입니다." });
      }
      const method = ["cash", "gcash", "card"].includes(body.paymentMethod) ? body.paymentMethod : order.payment_method;
      const now = getManilaTimestamp();

      db.exec("BEGIN");
      try {
        db.prepare(`
          UPDATE orders
          SET payment_method = ?, payment_status = 'paid',
              order_status = CASE WHEN order_status = 'waiting_payment' THEN 'preparing' ELSE order_status END,
              paid_at = COALESCE(paid_at, ?)
          WHERE id = ?
        `).run(method, now, orderId);
        recordOrderConsumptions(order);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }

      const updated = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId));
      logAudit(order.branch_id, "PAYMENT_CONFIRMED", "staff", `주문 #${order.order_number} ${method} 결제 확인`, {
        orderId,
      });
      broadcastEvent("order_updated", { branchId: order.branch_id, order: updated });
      return sendJson(res, 200, { ok: true, order: updated });
    }

    // 6. Advance Kitchen Status (preparing -> ready -> completed)
    const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (req.method === "POST" && statusMatch) {
      const orderId = statusMatch[1];
      const body = await readJsonBody(req);
      const nextStatus = String(body.orderStatus || "");
      if (!["preparing", "ready", "completed"].includes(nextStatus)) {
        return sendJson(res, 400, { ok: false, error: "허용되지 않는 상태 변경입니다." });
      }
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) return sendJson(res, 404, { ok: false, error: "주문을 찾을 수 없습니다." });
      if (order.payment_status !== "paid" && order.payment_status !== "void_requested") {
        return sendJson(res, 400, { ok: false, error: "결제 확인 전에는 조리를 시작할 수 없습니다!" });
      }
      const completedAt = nextStatus === "completed" ? getManilaTimestamp() : order.completed_at;
      db.prepare("UPDATE orders SET order_status = ?, completed_at = ? WHERE id = ?").run(
        nextStatus,
        completedAt,
        orderId
      );
      const updated = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId));
      broadcastEvent("order_updated", { branchId: order.branch_id, order: updated });
      return sendJson(res, 200, { ok: true, order: updated });
    }

    // 7. Staff Void Request (Cannot delete directly — requires Owner PIN!)
    const voidReqMatch = pathname.match(/^\/api\/orders\/([^/]+)\/void-request$/);
    if (req.method === "POST" && voidReqMatch) {
      const orderId = voidReqMatch[1];
      const body = await readJsonBody(req);
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) return sendJson(res, 404, { ok: false, error: "주문을 찾을 수 없습니다." });
      if (order.payment_status === "voided") {
        return sendJson(res, 400, { ok: false, error: "이미 취소 완료된 주문입니다." });
      }
      const reason = String(body.reason || "직원 오입력 / 손님 미수령").slice(0, 120);
      const staffNote = String(body.staffNote || "").slice(0, 240);
      const reqId = `vr_${crypto.randomUUID().slice(0, 8)}`;
      const now = getManilaTimestamp();

      db.prepare(
        "INSERT INTO void_requests (id, order_id, branch_id, reason, staff_note, status, requested_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
      ).run(reqId, orderId, order.branch_id, reason, staffNote, now);
      db.prepare("UPDATE orders SET payment_status = 'void_requested' WHERE id = ?").run(orderId);

      const branch = db.prepare("SELECT name FROM branches WHERE id = ?").get(order.branch_id);
      logAudit(order.branch_id, "VOID_REQUESTED", "staff", `주문 #${order.order_number} 취소 승인 요청 (₱${order.total_amount})`, {
        reqId,
        reason,
      });
      sendTelegramAlert(
        `🚨 [주문 취소(Void) 승인 요청]\n지점: ${branch?.name || order.branch_id}\n주문: #${order.order_number} (₱${order.total_amount})\n사유: ${reason}\n메모: ${staffNote || "-"}\n사장님 대시보드에서 PIN 승인 전까지 매출/재고는 보존됩니다.`
      );

      const updated = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId));
      broadcastEvent("void_requested", { branchId: order.branch_id, order: updated });
      return sendJson(res, 201, { ok: true, voidRequestId: reqId, order: updated });
    }

    // 8. Punch Cards (School Regular Meal Tickets)
    if (req.method === "GET" && pathname === "/api/punch-cards") {
      const branchId = urlObj.searchParams.get("branchId") || "";
      const q = (urlObj.searchParams.get("q") || "").trim().toLowerCase();
      const rows = branchId
        ? db.prepare("SELECT * FROM punch_cards WHERE branch_id = ? ORDER BY created_at DESC LIMIT 100").all(branchId)
        : db.prepare("SELECT * FROM punch_cards ORDER BY created_at DESC LIMIT 100").all();
      const filtered = q
        ? rows.filter((r) => r.code.toLowerCase().includes(q) || r.student_name.toLowerCase().includes(q))
        : rows;
      return sendJson(res, 200, { ok: true, punchCards: filtered });
    }

    if (req.method === "POST" && pathname === "/api/punch-cards") {
      const body = await readJsonBody(req);
      const branchId = String(body.branchId || "school-a");
      const studentName = String(body.studentName || "").trim();
      const packagePrice = Number(body.packagePrice) === 500 ? 500 : 200;
      const totalPunches = packagePrice === 500 ? 10 : 4;
      const paymentMethod = body.paymentMethod === "gcash" ? "gcash" : "cash";
      if (!studentName) return sendJson(res, 400, { ok: false, error: "학생 이름 또는 별칭을 입력하세요." });

      const count = db.prepare("SELECT COUNT(*) AS cnt FROM punch_cards").get().cnt;
      const code = String(body.code || `PC-${101 + count}`).trim().toUpperCase();
      const id = `pc_${crypto.randomUUID().slice(0, 8)}`;
      const today = getManilaDate();
      const now = getManilaTimestamp();

      try {
        db.prepare(`
          INSERT INTO punch_cards (id, code, branch_id, business_date, student_name, package_price, total_punches, remaining_punches, payment_method, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, code, branchId, today, studentName, packagePrice, totalPunches, totalPunches, paymentMethod, now);
      } catch {
        return sendJson(res, 400, { ok: false, error: `중복된 식권 번호(${code})입니다.` });
      }

      const card = db.prepare("SELECT * FROM punch_cards WHERE id = ?").get(id);
      logAudit(branchId, "PUNCH_CARD_ISSUED", "staff", `식권 발급 ${code} (${studentName}, ₱${packagePrice}, ${paymentMethod})`, {
        code,
        packagePrice,
      });
      broadcastEvent("punch_card_issued", { branchId, card });
      return sendJson(res, 201, { ok: true, punchCard: card });
    }

    // 9. True Blind Closeout (NEVER leaks expected cash or expected stock!)
    if (req.method === "POST" && pathname === "/api/closeouts") {
      const body = await readJsonBody(req);
      const branchId = String(body.branchId || "school-a");
      const branch = db.prepare("SELECT * FROM branches WHERE id = ?").get(branchId);
      if (!branch) return sendJson(res, 400, { ok: false, error: "유효하지 않은 지점입니다." });

      const staffName = String(body.staffName || "").trim();
      if (!staffName) return sendJson(res, 400, { ok: false, error: "마감 담당 직원 이름을 입력하세요." });

      const denoms = body.denominations || {};
      const countedCashTotal =
        Math.max(0, Math.floor(Number(denoms["1000"] || 0))) * 1000 +
        Math.max(0, Math.floor(Number(denoms["500"] || 0))) * 500 +
        Math.max(0, Math.floor(Number(denoms["200"] || 0))) * 200 +
        Math.max(0, Math.floor(Number(denoms["100"] || 0))) * 100 +
        Math.max(0, Math.floor(Number(denoms["50"] || 0))) * 50 +
        Math.max(0, Math.floor(Number(denoms["20"] || 0))) * 20 +
        Math.max(0, Math.round(Number(denoms["coins"] || 0)));

      const remainingStock = body.remainingStock || {};
      const reportedWaste = body.reportedWaste || {};
      const notes = String(body.notes || "").slice(0, 300);
      const businessDate = getManilaDate();
      const closeoutId = `cls_${crypto.randomUUID().slice(0, 8)}`;
      const now = getManilaTimestamp();

      db.prepare(`
        INSERT INTO blind_closeouts
          (id, branch_id, business_date, staff_name, denominations_json, counted_cash_total, remaining_stock_json, reported_waste_json, notes, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        closeoutId,
        branchId,
        businessDate,
        staffName,
        JSON.stringify(denoms),
        countedCashTotal,
        JSON.stringify(remainingStock),
        JSON.stringify(reportedWaste),
        notes,
        now
      );

      logAudit(branchId, "BLIND_CLOSEOUT", "staff", `${staffName} 블라인드 마감 제출 (실사 현금 ₱${countedCashTotal})`, {
        closeoutId,
      });

      // Compute audit privately on server for Telegram Owner Alert ONLY
      const recon = computeBranchReconciliation(branchId, businessDate);
      if (recon) {
        const diffCash = recon.metrics.cashOverShort;
        const stockIssues = recon.inventoryAudit
          .filter((i) => i.variance !== null && i.variance !== 0)
          .map((i) => `• ${i.name_ko}: ${i.variance > 0 ? `+${i.variance}` : i.variance}${i.unit}`)
          .join("\n");
        const flagIcon = recon.alerts.flagged ? "🚨 [오차 발생]" : "✅ [정산 일치]";
        sendTelegramAlert(
          `${flagIcon} ${branch.name} 마감 보고\n담당: ${staffName}\n현금 차액: ${
            diffCash === 0 ? "₱0 (완벽 일치)" : `${diffCash > 0 ? "+" : ""}₱${diffCash}`
          }\n${stockIssues ? `재고 오차:\n${stockIssues}` : "재고 1:1 오차 없음"}`
        );
      }

      broadcastEvent("closeout_submitted", { branchId, closeoutId, businessDate });
      // STRICT BLIND RESPONSE: zero expected numbers!
      return sendJson(res, 201, {
        ok: true,
        closeoutId,
        branchId,
        businessDate,
        submittedAt: now,
        message: "블라인드 마감 보고가 본사 사장님 대시보드로 전송되었습니다.",
      });
    }

    // 10. PayMongo Dynamic QR Ph Creation & Webhook
    if (req.method === "POST" && pathname === "/api/payments/paymongo-qr") {
      const body = await readJsonBody(req);
      const orderId = String(body.orderId || "");
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) return sendJson(res, 404, { ok: false, error: "주문을 찾을 수 없습니다." });

      const mode = getSetting("paymongo_mode", "manual_qr");
      const secretKey = getSetting("paymongo_secret_key", "").trim();
      let qrPayload = `PH.PAYMONGO.QRPH|ORDER:${order.id}|NO:${order.order_number}|AMT:${order.total_amount}`;
      let ref = `pm_demo_${order.id}`;
      let liveApiUsed = false;
      let warning = "";

      if (mode === "paymongo_dynamic" && secretKey.startsWith("sk_")) {
        try {
          const authHeader = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
          const intentRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: {
                attributes: {
                  amount: order.total_amount * 100,
                  payment_method_allowed: ["qrph"],
                  currency: "PHP",
                  description: `K-Snack Order #${order.order_number} (${order.branch_id})`,
                  metadata: { order_id: order.id, branch_id: order.branch_id },
                },
              },
            }),
          });
          const intentJson = await intentRes.json();
          if (intentRes.ok && intentJson?.data?.id) {
            ref = intentJson.data.id;
            const pmRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({
                data: {
                  attributes: {
                    type: "qrph",
                    billing: { name: `Customer #${order.order_number}`, email: "kiosk@seoulbites.ph" },
                  },
                },
              }),
            });
            const pmJson = await pmRes.json();
            if (pmRes.ok && pmJson?.data?.id) {
              const attRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${ref}/attach`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ data: { attributes: { payment_method: pmJson.data.id } } }),
              });
              const attJson = await attRes.json();
              const qrImg = attJson?.data?.attributes?.next_action?.code?.image_url;
              if (qrImg) {
                qrPayload = qrImg;
                liveApiUsed = true;
              }
            }
          } else {
            warning = intentJson?.errors?.[0]?.detail || "PayMongo API 응답 확인 필요 (시뮬레이션 QR로 대체)";
          }
        } catch (err) {
          warning = `PayMongo 연결 오류 (${err.message}) — 시뮬레이션 QR로 표시됨`;
        }
      }

      db.prepare("UPDATE orders SET paymongo_ref = ? WHERE id = ?").run(ref, order.id);
      return sendJson(res, 200, {
        ok: true,
        orderId: order.id,
        amount: order.total_amount,
        paymongoRef: ref,
        qrPayload,
        liveApiUsed,
        warning,
      });
    }

    if (req.method === "POST" && pathname === "/api/payments/simulate-webhook") {
      const body = await readJsonBody(req);
      const orderId = String(body.orderId || "");
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) return sendJson(res, 404, { ok: false, error: "주문을 찾을 수 없습니다." });
      const now = getManilaTimestamp();

      db.exec("BEGIN");
      try {
        db.prepare(`
          UPDATE orders
          SET payment_method = 'gcash', payment_status = 'paid',
              order_status = CASE WHEN order_status = 'waiting_payment' THEN 'preparing' ELSE order_status END,
              paid_at = COALESCE(paid_at, ?)
          WHERE id = ?
        `).run(now, order.id);
        recordOrderConsumptions(order);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }

      const updated = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id));
      logAudit(order.branch_id, "PAYMONGO_WEBHOOK_PAID", "paymongo", `주문 #${order.order_number} 동적 QR Ph 자동입금 확인 (₱${order.total_amount})`, {
        orderId: order.id,
      });
      broadcastEvent("order_updated", { branchId: order.branch_id, order: updated });
      return sendJson(res, 200, { ok: true, order: updated });
    }

    // Real PayMongo Webhook Endpoint
    if (req.method === "POST" && pathname === "/api/webhooks/paymongo") {
      const rawBody = await readBody(req);
      const webhookSecret = getSetting("paymongo_webhook_secret", "").trim();
      if (webhookSecret) {
        const sigHeader = String(req.headers["paymongo-signature"] || "");
        const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.trim().split("=")));
        const t = parts.t;
        const expected = parts.te || parts.li;
        if (!t || !expected) return sendJson(res, 401, { ok: false, error: "Missing Paymongo-Signature" });
        const computed = crypto.createHmac("sha256", webhookSecret).update(`${t}.${rawBody}`).digest("hex");
        if (!safeEqualHex(computed, expected)) {
          return sendJson(res, 401, { ok: false, error: "Invalid Paymongo-Signature" });
        }
      }

      const event = parseJsonSafe(rawBody, {});
      const eventType = event?.data?.attributes?.type || "";
      const metadata = event?.data?.attributes?.data?.attributes?.metadata || {};
      const intentId = event?.data?.attributes?.data?.attributes?.payment_intent_id || event?.data?.attributes?.data?.id || "";

      if (eventType.includes("paid") || eventType.includes("chargeable")) {
        const order = metadata.order_id
          ? db.prepare("SELECT * FROM orders WHERE id = ?").get(metadata.order_id)
          : db.prepare("SELECT * FROM orders WHERE paymongo_ref = ?").get(intentId);
        if (order && order.payment_status === "unpaid") {
          const now = getManilaTimestamp();
          db.exec("BEGIN");
          try {
            db.prepare(
              "UPDATE orders SET payment_method = 'gcash', payment_status = 'paid', order_status = 'preparing', paid_at = ? WHERE id = ?"
            ).run(now, order.id);
            recordOrderConsumptions(order);
            db.exec("COMMIT");
          } catch (err) {
            db.exec("ROLLBACK");
            throw err;
          }
          const updated = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id));
          logAudit(order.branch_id, "PAYMONGO_WEBHOOK_PAID", "paymongo", `PayMongo 실웹훅 입금완료 #${order.order_number}`, {
            eventType,
          });
          broadcastEvent("order_updated", { branchId: order.branch_id, order: updated });
        }
      }
      return sendJson(res, 200, { ok: true });
    }

    // 11. Admin PIN Verification
    if (req.method === "POST" && pathname === "/api/admin/verify-pin") {
      const body = await readJsonBody(req);
      const pin = getPinFromReq(req, urlObj, body);
      if (!verifyOwnerPin(pin)) return sendJson(res, 401, { ok: false, error: "사장님 PIN 번호가 일치하지 않습니다." });
      return sendJson(res, 200, { ok: true });
    }

    // ---------- OWNER PIN-PROTECTED ROUTES ----------
    if (pathname.startsWith("/api/admin/")) {
      const body = req.method === "POST" || req.method === "PUT" ? await readJsonBody(req) : {};
      const pin = getPinFromReq(req, urlObj, body);
      if (!verifyOwnerPin(pin)) {
        return sendJson(res, 401, { ok: false, error: "사장님 PIN 인증이 필요합니다." });
      }

      // Admin Dashboard Overview (Multi-Branch!)
      if (req.method === "GET" && pathname === "/api/admin/dashboard") {
        const businessDate = urlObj.searchParams.get("date") || getManilaDate();
        const filterBranch = urlObj.searchParams.get("branchId") || "all";
        const branches = db.prepare("SELECT * FROM branches ORDER BY sort_order ASC").all();

        const branchSummaries = branches
          .filter((b) => filterBranch === "all" || b.id === filterBranch)
          .map((b) => computeBranchReconciliation(b.id, businessDate))
          .filter(Boolean);

        const totals = branchSummaries.reduce(
          (acc, br) => {
            acc.grossSales += br.metrics.grossSales;
            acc.expectedCashSales += br.metrics.expectedCashSales;
            acc.expectedGcashSales += br.metrics.expectedGcashSales;
            acc.cardOrderSales += br.metrics.cardOrderSales;
            acc.punchCardRedeemedValue += br.metrics.punchCardRedeemedValue;
            acc.paidOrderCount += br.metrics.paidOrderCount;
            if (br.alerts.flagged) acc.flaggedBranches += 1;
            return acc;
          },
          {
            grossSales: 0,
            expectedCashSales: 0,
            expectedGcashSales: 0,
            cardOrderSales: 0,
            punchCardRedeemedValue: 0,
            paidOrderCount: 0,
            flaggedBranches: 0,
          }
        );

        // Multi-Branch BIR ₱3,000,000 VAT Projection
        const ytdTotalRow = db
          .prepare("SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE payment_status IN ('paid','void_requested')")
          .get();
        const activeDaysRow = db
          .prepare("SELECT COUNT(DISTINCT business_date) AS days FROM orders WHERE payment_status IN ('paid','void_requested')")
          .get();
        const pcYtdRow = db.prepare("SELECT COALESCE(SUM(package_price), 0) AS total FROM punch_cards").get();
        const ytdGross = Number(ytdTotalRow.total) + Number(pcYtdRow.total);
        const operatingDays = Math.max(1, Number(activeDaysRow.days || 1));
        const dailyAvgAllBranches = Math.round(ytdGross / operatingDays);
        const projectedAnnual = dailyAvgAllBranches * 260; // ~260 school/shop operating days/year
        const vatThreshold = Number(getSetting("bir_vat_threshold", "3000000"));

        const voidRequests = db
          .prepare(`
            SELECT vr.*, o.order_number, o.total_amount, o.payment_method, o.items_json, b.name AS branch_name
            FROM void_requests vr
            JOIN orders o ON o.id = vr.order_id
            JOIN branches b ON b.id = vr.branch_id
            ORDER BY CASE WHEN vr.status = 'pending' THEN 0 ELSE 1 END, vr.requested_at DESC
            LIMIT 50
          `)
          .all()
          .map((r) => ({ ...r, items: parseJsonSafe(r.items_json, []) }));

        const auditLogs = db
          .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 60")
          .all()
          .map((a) => ({ ...a, details: parseJsonSafe(a.details_json, {}) }));

        const orders =
          filterBranch === "all"
            ? db.prepare("SELECT * FROM orders WHERE business_date = ? ORDER BY created_at DESC LIMIT 200").all(businessDate)
            : db
                .prepare("SELECT * FROM orders WHERE branch_id = ? AND business_date = ? ORDER BY created_at DESC LIMIT 200")
                .all(filterBranch, businessDate);

        return sendJson(res, 200, {
          ok: true,
          businessDate,
          totals,
          branchSummaries,
          birTracker: {
            tin: getSetting("bir_tin", "123-456-789-000"),
            vatThreshold,
            ytdGross,
            dailyAvgAllBranches,
            projectedAnnual,
            percentOfThreshold: Math.min(100, Math.round((projectedAnnual / vatThreshold) * 100)),
          },
          voidRequests,
          auditLogs,
          orders: orders.map(formatOrderForClient),
          settings: {
            shopName: getSetting("shop_name", "HM Snacks"),
            paymongoMode: getSetting("paymongo_mode", "manual_qr"),
            paymongoSecretKeyMasked: getSetting("paymongo_secret_key", "") ? "sk_****configured" : "",
            paymongoWebhookSecretMasked: getSetting("paymongo_webhook_secret", "") ? "whsec_****configured" : "",
            telegramConfigured: Boolean(getSetting("telegram_bot_token", "") && getSetting("telegram_chat_id", "")),
            telegramChatId: getSetting("telegram_chat_id", ""),
            birTin: getSetting("bir_tin", "123-456-789-000"),
            signageGcashName: getSetting("signage_gcash_name", "HM Snacks"),
            signageGcashNumber: getSetting("signage_gcash_number", "0917-000-8899"),
          },
        });
      }

      // Resolve Void Request
      const resolveVoidMatch = pathname.match(/^\/api\/admin\/void-requests\/([^/]+)\/resolve$/);
      if (req.method === "POST" && resolveVoidMatch) {
        const reqId = resolveVoidMatch[1];
        const decision = body.decision === "approve" ? "approved" : "rejected";
        const vr = db.prepare("SELECT * FROM void_requests WHERE id = ?").get(reqId);
        if (!vr) return sendJson(res, 404, { ok: false, error: "취소 요청을 찾을 수 없습니다." });
        if (vr.status !== "pending") return sendJson(res, 400, { ok: false, error: "이미 처리된 요청입니다." });

        const now = getManilaTimestamp();
        db.exec("BEGIN");
        try {
          db.prepare("UPDATE void_requests SET status = ?, resolved_at = ? WHERE id = ?").run(decision, now, reqId);
          if (decision === "approved") {
            db.prepare("UPDATE orders SET payment_status = 'voided', order_status = 'voided' WHERE id = ?").run(vr.order_id);
            db.prepare("UPDATE order_consumptions SET is_voided = 1 WHERE order_id = ?").run(vr.order_id);
          } else {
            db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(vr.order_id);
          }
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }

        const updatedOrder = formatOrderForClient(db.prepare("SELECT * FROM orders WHERE id = ?").get(vr.order_id));
        logAudit(vr.branch_id, `VOID_${decision.toUpperCase()}`, "owner", `주문 #${updatedOrder.order_number} 취소 ${decision === "approved" ? "승인" : "반려"}`, {
          reqId,
        });
        broadcastEvent("order_updated", { branchId: vr.branch_id, order: updatedOrder });
        return sendJson(res, 200, { ok: true, decision, order: updatedOrder });
      }

      // Daily Inventory Dispatch Allocation (Central Kitchen 1:1)
      if (req.method === "POST" && pathname === "/api/admin/inventory/allocate") {
        const branchId = String(body.branchId || "school-a");
        const businessDate = String(body.businessDate || getManilaDate());
        const allocations = Array.isArray(body.allocations) ? body.allocations : [];
        const now = getManilaTimestamp();
        const stmt = db.prepare(`
          INSERT INTO branch_inventory_allocations
            (branch_id, business_date, inventory_item_id, opening_qty, approved_waste_qty, notes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(branch_id, business_date, inventory_item_id) DO UPDATE SET
            opening_qty = excluded.opening_qty,
            approved_waste_qty = excluded.approved_waste_qty,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        `);
        for (const a of allocations) {
          stmt.run(
            branchId,
            businessDate,
            String(a.inventoryItemId),
            Math.max(0, Math.floor(Number(a.openingQty || 0))),
            Math.max(0, Math.floor(Number(a.approvedWasteQty || 0))),
            String(a.notes || ""),
            now
          );
        }
        if (body.openingFloat !== undefined) {
          db.prepare("UPDATE branches SET opening_float = ? WHERE id = ?").run(
            Math.max(0, Math.round(Number(body.openingFloat))),
            branchId
          );
        }
        logAudit(branchId, "INVENTORY_ALLOCATED", "owner", `본사 물량 배급 및 오픈 시재 저장 (${businessDate})`, {
          branchId,
        });
        broadcastEvent("stock_updated", { branchId, businessDate });
        return sendJson(res, 200, { ok: true });
      }

      // Branch Management (Create / Update)
      if (req.method === "POST" && pathname === "/api/admin/branches") {
        const id = String(body.id || "").trim() || `branch-${crypto.randomUUID().slice(0, 6)}`;
        const name = String(body.name || "").trim();
        if (!name) return sendJson(res, 400, { ok: false, error: "지점 이름을 입력하세요." });
        const type = body.type === "shop_kiosk" ? "shop_kiosk" : "school_stall";
        const defaultMode = body.defaultMode === "kiosk" ? "kiosk" : "pos";
        const openingFloat = Math.max(0, Math.round(Number(body.openingFloat ?? 2500)));
        const gcashNumber = String(body.gcashNumber || "").trim();
        const qrImageUrl = String(body.qrImageUrl || "").trim();
        const isActive = body.isActive === false ? 0 : 1;
        const now = getManilaTimestamp();

        const existing = db.prepare("SELECT id FROM branches WHERE id = ?").get(id);
        if (existing) {
          db.prepare(`
            UPDATE branches SET name = ?, type = ?, default_mode = ?, opening_float = ?, gcash_number = ?,
              qr_image_url = CASE WHEN ? <> '' THEN ? ELSE qr_image_url END, is_active = ?
            WHERE id = ?
          `).run(name, type, defaultMode, openingFloat, gcashNumber, qrImageUrl, qrImageUrl, isActive, id);
        } else {
          const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS s FROM branches").get().s;
          db.prepare(`
            INSERT INTO branches (id, name, type, default_mode, opening_float, gcash_number, qr_image_url, is_active, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, name, type, defaultMode, openingFloat, gcashNumber, qrImageUrl, isActive, maxSort + 1, now);
          ensureDailyAllocations(id, getManilaDate());
        }
        logAudit(id, "BRANCH_SAVED", "owner", `지점 설정 저장: ${name}`, { type, defaultMode });
        return sendJson(res, 200, { ok: true, id });
      }

      // Menu Management (Create / Update / Photo Data URL)
      if (req.method === "POST" && pathname === "/api/admin/menu") {
        const id = String(body.id || "").trim() || `menu_${crypto.randomUUID().slice(0, 6)}`;
        const existing = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
        const nameKo = String(body.nameKo ?? existing?.name_ko ?? "").trim();
        const nameEn = String(body.nameEn ?? existing?.name_en ?? "").trim();
        if (!nameKo || !nameEn) return sendJson(res, 400, { ok: false, error: "메뉴 한국어/영어 이름을 입력하세요." });

        const category = String(body.category ?? existing?.category ?? "combo");
        const nameTl = String(body.nameTl ?? existing?.name_tl ?? "");
        const descEn = String(body.descriptionEn ?? existing?.description_en ?? "");
        const price = Math.max(10, Math.round(Number(body.price ?? existing?.price ?? 50)));
        const imageUrl = String(body.imageUrl ?? existing?.image_url ?? "svg:combo");
        const isQuickCombo = body.isQuickCombo !== undefined ? (body.isQuickCombo ? 1 : 0) : existing?.is_quick_combo ?? 0;
        const isAvailable = body.isAvailable !== undefined ? (body.isAvailable ? 1 : 0) : existing?.is_available ?? 1;
        const consumes = body.consumes !== undefined ? body.consumes : parseJsonSafe(existing?.consumes_json, []);
        const options = body.options !== undefined ? body.options : parseJsonSafe(existing?.options_json, []);

        if (existing) {
          db.prepare(`
            UPDATE menu_items
            SET category = ?, name_ko = ?, name_en = ?, name_tl = ?, description_en = ?, price = ?,
                image_url = ?, is_quick_combo = ?, options_json = ?, consumes_json = ?, is_available = ?
            WHERE id = ?
          `).run(
            category, nameKo, nameEn, nameTl, descEn, price, imageUrl, isQuickCombo,
            JSON.stringify(options), JSON.stringify(consumes), isAvailable, id
          );
        } else {
          const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS s FROM menu_items").get().s;
          db.prepare(`
            INSERT INTO menu_items
              (id, category, name_ko, name_en, name_tl, description_en, price, image_url, is_quick_combo, options_json, consumes_json, is_available, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, category, nameKo, nameEn, nameTl, descEn, price, imageUrl, isQuickCombo,
            JSON.stringify(options), JSON.stringify(consumes), isAvailable, maxSort + 1
          );
        }

        logAudit("all", "MENU_SAVED", "owner", `메뉴 저장: ${nameKo} (₱${price})`, { id });
        return sendJson(res, 200, { ok: true, id });
      }

      const deleteMenuMatch = pathname.match(/^\/api\/admin\/menu\/([^/]+)$/);
      if (req.method === "DELETE" && deleteMenuMatch) {
        const id = decodeURIComponent(deleteMenuMatch[1]);
        db.prepare("DELETE FROM menu_items WHERE id = ?").run(id);
        logAudit("all", "MENU_DELETED", "owner", `메뉴 삭제: ${id}`, { id });
        return sendJson(res, 200, { ok: true, id });
      }

      // Admin Settings Update (PIN, Telegram, PayMongo, BIR, Signage)
      if (req.method === "POST" && pathname === "/api/admin/settings") {
        if (body.shopName !== undefined) setSetting("shop_name", String(body.shopName).trim() || "HM Snacks");
        if (body.paymongoMode !== undefined) {
          setSetting("paymongo_mode", body.paymongoMode === "paymongo_dynamic" ? "paymongo_dynamic" : "manual_qr");
        }
        if (body.paymongoSecretKey) setSetting("paymongo_secret_key", String(body.paymongoSecretKey).trim());
        if (body.paymongoWebhookSecret) setSetting("paymongo_webhook_secret", String(body.paymongoWebhookSecret).trim());
        if (body.telegramBotToken !== undefined) setSetting("telegram_bot_token", String(body.telegramBotToken).trim());
        if (body.telegramChatId !== undefined) setSetting("telegram_chat_id", String(body.telegramChatId).trim());
        if (body.birTin !== undefined) setSetting("bir_tin", String(body.birTin).trim());
        if (body.signageGcashName !== undefined) setSetting("signage_gcash_name", String(body.signageGcashName).trim());
        if (body.signageGcashNumber !== undefined) setSetting("signage_gcash_number", String(body.signageGcashNumber).trim());
        if (body.newPin && /^\d{4,8}$/.test(String(body.newPin))) {
          setSetting("owner_pin_hash", hashPin(String(body.newPin)));
          logAudit("all", "PIN_CHANGED", "owner", "사장님 관리자 PIN 변경됨", {});
        }
        if (body.branchQrBranchId && body.branchQrImageUrl !== undefined) {
          db.prepare("UPDATE branches SET qr_image_url = ? WHERE id = ?").run(
            String(body.branchQrImageUrl),
            String(body.branchQrBranchId)
          );
        }
        logAudit("all", "SETTINGS_UPDATED", "owner", "시스템·결제·알림 설정 저장", {});
        return sendJson(res, 200, { ok: true });
      }

      // Clean Day / Data Reset
      if (req.method === "POST" && pathname === "/api/admin/demo-reset") {
        const today = getManilaDate();
        const wipeMenus = Boolean(body.wipeMenus);
        db.exec("BEGIN");
        try {
          db.prepare("DELETE FROM void_requests").run();
          db.prepare("DELETE FROM order_consumptions").run();
          db.prepare("DELETE FROM orders").run();
          db.prepare("DELETE FROM blind_closeouts").run();
          db.prepare("DELETE FROM punch_cards").run();
          if (wipeMenus) db.prepare("DELETE FROM menu_items").run();
          logAudit("all", "DAY_RESET", "owner", wipeMenus ? "전체 데이터 및 메뉴 초기화" : "오늘 매출·주문·마감 기록 초기화", { today, wipeMenus });
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
        broadcastEvent("order_updated", { branchId: "all", reset: true });
        return sendJson(res, 200, { ok: true });
      }

      // Export CSV (UTF-8 BOM for Excel)
      if (req.method === "GET" && pathname === "/api/admin/export-csv") {
        const businessDate = urlObj.searchParams.get("date") || getManilaDate();
        const branchId = urlObj.searchParams.get("branchId") || "all";
        const rows =
          branchId === "all"
            ? db.prepare("SELECT * FROM orders WHERE business_date = ? ORDER BY created_at ASC").all(businessDate)
            : db.prepare("SELECT * FROM orders WHERE branch_id = ? AND business_date = ? ORDER BY created_at ASC").all(branchId, businessDate);

        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const header = ["Date", "Branch", "Order#", "Mode", "Table", "Items", "Total(PHP)", "Payment", "Status", "BIR_SI_500+", "CreatedAt"];
        const lines = [header.map(esc).join(",")];
        for (const r of rows) {
          const itemsStr = parseJsonSafe(r.items_json, [])
            .map((i) => `${i.name_en}x${i.qty}`)
            .join(" | ");
          lines.push(
            [
              r.business_date,
              r.branch_id,
              `#${r.order_number}`,
              r.source_mode,
              r.table_label,
              itemsStr,
              r.total_amount,
              r.payment_method,
              r.payment_status,
              r.bir_si_required ? "YES (>=500)" : "NO",
              r.created_at,
            ]
              .map(esc)
              .join(",")
          );
        }
        const csv = "\uFEFF" + lines.join("\n");
        return sendText(res, 200, csv, "text/csv; charset=utf-8", {
          "Content-Disposition": `attachment; filename="k-snack-${businessDate}-${branchId}.csv"`,
        });
      }

      return sendJson(res, 404, { ok: false, error: "Admin API not found" });
    }

    // ---------- Static Asset Serving ----------
    if (req.method === "GET") {
      let relPath = pathname === "/" ? "/index.html" : pathname;
      const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(PUBLIC_DIR, safePath);
      if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(PUBLIC_DIR, "index.html");
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
      res.end(data);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    console.error("[Server Error]", err);
    sendJson(res, 500, { ok: false, error: err.message || "Internal server error" });
  }
});

if (process.argv[1] === __filename) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`K-Snack Multi-Branch POS running at http://localhost:${PORT}`);
    console.log(`  - School Staff 2-Tap POS : http://localhost:${PORT}/?mode=pos&branchId=school-a`);
    console.log(`  - Customer Self Kiosk    : http://localhost:${PORT}/?mode=kiosk&branchId=univ-main`);
    console.log(`  - Kitchen KDS            : http://localhost:${PORT}/?mode=kitchen&branchId=school-a`);
    console.log(`  - Staff Blind Closeout   : http://localhost:${PORT}/?mode=closeout&branchId=school-a`);
    console.log(`  - Owner Command (PIN7777): http://localhost:${PORT}/?mode=admin`);
    console.log(`  - Counter Signage Studio : http://localhost:${PORT}/?mode=signage`);
  });
}

export { server, db };
