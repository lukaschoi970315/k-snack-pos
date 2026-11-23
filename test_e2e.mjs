import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "./public/qr.js";
const tmpDb = path.join(os.tmpdir(), `ksnack_e2e_${Date.now()}.db`);
process.env.DB_PATH = tmpDb;
process.env.NO_SAMPLE_SEED = "1";
process.env.PORT = "0";
const KSnackQR = globalThis.KSnackQR;
const { server } = await import("./server.js");

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

async function reqJson(pathname, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body === "object") {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${pathname}`, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, data: json };
}

try {
  // 1. Offline QR Generator check
  const svg = KSnackQR.generateQrSvg("https://example.com/?mode=kiosk&branchId=school-a&table=LINE-QR", 180);
  assert.ok(svg.startsWith("<svg") && svg.includes("<rect"), "QR SVG should generate cleanly offline");

  // 2. Bootstrap sanity & privacy check (clean HM Snacks start with 0 menus)
  const boot = await reqJson("/api/bootstrap");
  assert.equal(boot.status, 200);
  assert.equal(boot.data.shopName, "HM Snacks");
  assert.equal(boot.data.branches.length, 3);
  assert.equal(boot.data.menuItems.length, 0);
  assert.equal(boot.data.paymongoSecretKey, undefined, "Bootstrap must never leak API secret");

  // 2b. Owner creates and deletes menus via Admin API
  const testMenus = [
    { id: "combo_chicken_set", category: "combo", nameKo: "치킨마요 컵밥 + 음료", nameEn: "Chicken Mayo Cupbap + Drink", price: 150, isQuickCombo: true, consumes: [{ inventory_item_id: "bowl_cupbap", qty: 1 }, { inventory_item_id: "can_drink", qty: 1 }] },
    { id: "cupbap_chicken", category: "cupbap", nameKo: "치킨마요 컵밥", nameEn: "Chicken Mayo Cupbap", price: 120, isQuickCombo: false, options: [{ id: "topping", label_ko: "토핑", label_en: "Topping", choices: [{ id: "base", label_ko: "기본", label_en: "Standard", priceDelta: 0 }, { id: "egg", label_ko: "계란", label_en: "Fried Egg", priceDelta: 20 }] }], consumes: [{ inventory_item_id: "bowl_cupbap", qty: 1 }] },
    { id: "combo_full_set", category: "combo", nameKo: "풀세트", nameEn: "Full Set", price: 200, isQuickCombo: true, consumes: [{ inventory_item_id: "bowl_cupbap", qty: 1 }, { inventory_item_id: "cup_tteok", qty: 1 }, { inventory_item_id: "can_drink", qty: 1 }] },
    { id: "combo_spam_cupbap", category: "combo", nameKo: "스팸 컵밥", nameEn: "Spam Cupbap", price: 100, isQuickCombo: true, consumes: [{ inventory_item_id: "bowl_cupbap", qty: 1 }] },
    { id: "combo_eomuk_tea", category: "combo", nameKo: "오뎅+아이스티", nameEn: "Eomuk + Tea", price: 100, isQuickCombo: true, consumes: [{ inventory_item_id: "skewer_eomuk", qty: 2 }, { inventory_item_id: "can_drink", qty: 1 }] },
    { id: "drink_iced_tea", category: "drink", nameKo: "아이스티", nameEn: "Iced Tea", price: 50, isQuickCombo: true, consumes: [{ inventory_item_id: "can_drink", qty: 1 }] },
    { id: "temp_del", category: "drink", nameKo: "임시메뉴", nameEn: "Temp Menu", price: 50, isQuickCombo: false, consumes: [] },
  ];
  for (const m of testMenus) {
    const cr = await reqJson("/api/admin/menu", { method: "POST", headers: { "X-Owner-Pin": "7777" }, body: m });
    assert.equal(cr.status, 200);
  }
  const delRes = await reqJson("/api/admin/menu/temp_del", { method: "DELETE", headers: { "X-Owner-Pin": "7777" } });
  assert.equal(delRes.status, 200);
  const bootAfter = await reqJson("/api/bootstrap");
  assert.equal(bootAfter.data.menuItems.length, 6);

  // 3. Server-side price tamper protection & POS 2-Tap checkout with change calculation
  const posOrder = await reqJson("/api/orders", {
    method: "POST",
    body: {
      branchId: "school-a",
      sourceMode: "pos",
      paymentMethod: "cash",
      cashReceived: 500,
      instantComplete: true,
      // Attempt client price forgery (ignored by server!)
      items: [
        { menuItemId: "combo_chicken_set", qty: 1, unitPrice: 1 },
        {
          menuItemId: "cupbap_chicken",
          qty: 1,
          selectedOptions: [{ groupId: "topping", optionId: "egg" }],
        },
      ],
    },
  });
  assert.equal(posOrder.status, 201);
  // 150 + (120 + 20) = 290
  assert.equal(posOrder.data.order.total_amount, 290);
  assert.equal(posOrder.data.order.change_given, 210);
  assert.equal(posOrder.data.order.payment_status, "paid");
  assert.equal(posOrder.data.order.order_status, "completed");

  // 4. Customer Kiosk Cash order starts unpaid & cannot be cooked until staff confirms
  const kioskCash = await reqJson("/api/orders", {
    method: "POST",
    body: {
      branchId: "univ-main",
      sourceMode: "table_qr",
      tableLabel: "Table T2",
      paymentMethod: "cash",
      items: [{ menuItemId: "combo_full_set", qty: 3 }], // 600 >= 500 BIR SI flag!
    },
  });
  assert.equal(kioskCash.status, 201);
  assert.equal(kioskCash.data.order.total_amount, 600);
  assert.equal(kioskCash.data.order.bir_si_required, true);
  assert.equal(kioskCash.data.order.order_status, "waiting_payment");

  // Attempting to advance cooking before payment confirmation must fail!
  const prematureCook = await reqJson(`/api/orders/${kioskCash.data.order.id}/status`, {
    method: "POST",
    body: { orderStatus: "preparing" },
  });
  assert.equal(prematureCook.status, 400);

  // Confirm payment -> transitions to preparing
  const confirmed = await reqJson(`/api/orders/${kioskCash.data.order.id}/confirm-payment`, {
    method: "POST",
    body: { paymentMethod: "cash" },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.order.order_status, "preparing");

  // 5. PayMongo QR Ph creation + simulated webhook auto-approval
  const kioskGcash = await reqJson("/api/orders", {
    method: "POST",
    body: {
      branchId: "univ-main",
      sourceMode: "kiosk",
      paymentMethod: "gcash",
      items: [{ menuItemId: "combo_spam_cupbap", qty: 1 }],
    },
  });
  assert.equal(kioskGcash.data.order.order_status, "waiting_payment");
  const pmQr = await reqJson("/api/payments/paymongo-qr", {
    method: "POST",
    body: { orderId: kioskGcash.data.order.id },
  });
  assert.equal(pmQr.status, 200);
  assert.ok(pmQr.data.qrPayload.includes(kioskGcash.data.order.id));

  const simHook = await reqJson("/api/payments/simulate-webhook", {
    method: "POST",
    body: { orderId: kioskGcash.data.order.id },
  });
  assert.equal(simHook.status, 200);
  assert.equal(simHook.data.order.payment_status, "paid");
  assert.equal(simHook.data.order.order_status, "preparing");

  // 6. Punch Card Issuance (₱200 cash) & Redemption (₱100 meal -> 2 punches deducted)
  const pcIssue = await reqJson("/api/punch-cards", {
    method: "POST",
    body: { branchId: "school-a", studentName: "Test Student", packagePrice: 200, paymentMethod: "cash" },
  });
  assert.equal(pcIssue.status, 201);
  const pcCode = pcIssue.data.punchCard.code;

  const pcRedeem = await reqJson("/api/orders", {
    method: "POST",
    body: {
      branchId: "school-a",
      sourceMode: "pos",
      paymentMethod: "punch_card",
      punchCardCode: pcCode,
      items: [{ menuItemId: "combo_eomuk_tea", qty: 1 }], // ₱100 -> 2 punches, consumes 2 skewers + 1 drink
    },
  });
  assert.equal(pcRedeem.status, 201);
  assert.equal(pcRedeem.data.order.payment_status, "paid");

  const pcCheck = await reqJson(`/api/punch-cards?branchId=school-a&q=${encodeURIComponent(pcCode)}`);
  assert.equal(pcCheck.data.punchCards[0].remaining_punches, 2);

  // 7. Staff Void Request + PIN enforcement
  const badAdmin = await reqJson("/api/admin/dashboard", { headers: { "X-Owner-Pin": "0000" } });
  assert.equal(badAdmin.status, 401);

  const voidTarget = await reqJson("/api/orders", {
    method: "POST",
    body: {
      branchId: "school-a",
      sourceMode: "pos",
      paymentMethod: "cash",
      items: [{ menuItemId: "drink_iced_tea", qty: 1 }],
    },
  });
  const vr = await reqJson(`/api/orders/${voidTarget.data.order.id}/void-request`, {
    method: "POST",
    body: { reason: "직원 오입력", staffNote: "테스트 취소" },
  });
  assert.equal(vr.status, 201);

  const vrResolve = await reqJson(`/api/admin/void-requests/${vr.data.voidRequestId}/resolve`, {
    method: "POST",
    headers: { "X-Owner-Pin": "7777" },
    body: { decision: "approve" },
  });
  assert.equal(vrResolve.status, 200);
  assert.equal(vrResolve.data.order.payment_status, "voided");

  // 8. True Blind Closeout: MUST NOT return expected cash/stock, MUST catch theft in Admin!
  // On school-a:
  // Opening float = 2500
  // Paid cash sales = posOrder (290) + pcIssue (200) = 490 (voidTarget was voided!)
  // Expected drawer cash = 2500 + 490 = 2990
  // Expected remaining cupbap bowls = 80 (default) - 2 (combo_chicken_set + cupbap_chicken) = 78
  // Staff intentionally submits counted cash = 2890 (-100 short!) and cupbap bowls = 76 (-2 stolen!)
  const closeRes = await reqJson("/api/closeouts", {
    method: "POST",
    body: {
      branchId: "school-a",
      staffName: "E2E Cashier",
      denominations: { "1000": 2, "500": 1, "200": 1, "100": 1, "50": 1, "20": 2, coins: 0 }, // 2000+500+200+100+50+40 = 2890!
      remainingStock: {
        skewer_eomuk: 148, // 150 - 2 (from pcRedeem) = 148 (exact!)
        bowl_cupbap: 76,   // 80 - 2 = 78 expected -> -2 missing!
        bowl_ramyun: 50,
        cup_tteok: 60,
        can_drink: 98,     // 100 - 2 (combo_chicken_set + pcRedeem), voided iced tea restored!
      },
      notes: "E2E Blind Test",
    },
  });
  assert.equal(closeRes.status, 201);
  assert.equal(closeRes.data.cashOverShort, undefined, "Blind closeout MUST NOT leak cashOverShort");
  assert.equal(closeRes.data.expectedDrawerCash, undefined, "Blind closeout MUST NOT leak expectedDrawerCash");

  const dash = await reqJson("/api/admin/dashboard", { headers: { "X-Owner-Pin": "7777" } });
  assert.equal(dash.status, 200);
  const schoolA = dash.data.branchSummaries.find((b) => b.branch.id === "school-a");
  assert.equal(schoolA.metrics.expectedDrawerCash, 2990);
  assert.equal(schoolA.metrics.cashOverShort, -100);
  assert.equal(schoolA.alerts.hasCashDiscrepancy, true);
  assert.equal(schoolA.alerts.hasStockDiscrepancy, true);
  const cupbapAudit = schoolA.inventoryAudit.find((i) => i.inventoryItemId === "bowl_cupbap");
  assert.equal(cupbapAudit.variance, -2);
  const drinkAudit = schoolA.inventoryAudit.find((i) => i.inventoryItemId === "can_drink");
  assert.equal(drinkAudit.variance, 0); // Voided iced tea did NOT count as sold!

  // 9. CSV Export
  const csvRes = await fetch(`${BASE}/api/admin/export-csv?pin=7777&branchId=all`);
  assert.equal(csvRes.status, 200);
  const csvText = await csvRes.text();
  assert.ok(csvText.includes("Chicken Mayo Cupbap") && csvText.includes("YES (>=500)"));

  console.log("E2E_VERIFICATION_OK");
} finally {
  server.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(tmpDb + suffix)) fs.unlinkSync(tmpDb + suffix);
  }
}
