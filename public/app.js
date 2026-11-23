/* HM Snacks — Multi-Branch POS, Self Kiosk, Table QR, KDS, Blind Closeout, Owner Command & Signage */

(() => {
  const esc = (str) =>
    String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const php = (n) => `₱${Number(n || 0).toLocaleString("en-PH")}`;

  const urlParams = new URLSearchParams(window.location.search);
  const initialModeParam = urlParams.get("mode") || "";
  const initialBranchParam = urlParams.get("branchId") || localStorage.getItem("ksnack_branch") || "school-a";
  const tableParam = urlParams.get("table") || "";
  const initialLockParam = urlParams.get("lock") === "1";

  const state = {
    bootstrap: null,
    mode: initialModeParam || "pos",
    branchId: initialBranchParam,
    tableLabel: tableParam,
    kioskLocked: initialLockParam || localStorage.getItem("ksnack_locked") === "1",
    lang: localStorage.getItem("ksnack_lang") || "ko_en", // 'ko_en' | 'en' | 'ko' | 'tl'
    posFilter: "combo", // 'combo' | 'all' | categories
    kioskFilter: "all",
    cart: [],
    posInstantComplete: true,
    posTendered: 0,
    orders: [],
    soundEnabled: true,
    kdsSubView: "board", // 'board' | 'pickup_tv'
    adminPin: sessionStorage.getItem("ksnack_pin") || "",
    adminTab: "overview",
    adminDate: "",
    adminFilterBranch: "all",
    adminData: null,
    punchCards: [],
    lastCreatedOrder: null,
    sse: null,
  };

  const I18N = {
    ko_en: {
      quickBanner: "⚡ 5-Second Quick Combos (옵션 없이 바로 담기)",
      all: "전체 메뉴",
      combo: "⚡ 초고속 세트",
      eomuk: "🍢 오뎅",
      cupbap: "🍚 컵밥",
      ramyun: "🍜 라면",
      tteokbokki: "🌶️ 떡볶이",
      drink: "🥤 음료",
      addToTray: "+ 담기",
      trayTitle: "주문 내역 (Your Order)",
      emptyTray: "메뉴를 눌러 장바구니에 담아주세요",
      total: "총 결제 금액",
      payCash: "💵 현금 (Cash Box)",
      payGcash: "📱 GCash / QR Ph",
      payCard: "💳 카드 (At Counter)",
      cashGuide: "접힌 지폐도 OK! 펴서 직원에게 보여주신 뒤 투명 돈통에 넣어주세요. (Unfold bills flat & show staff before dropping)",
    },
    en: {
      quickBanner: "⚡ 5-Second Quick Combos (No Options Needed)",
      all: "All Menu",
      combo: "⚡ Quick Combos",
      eomuk: "🍢 Eomuk",
      cupbap: "🍚 Cupbap",
      ramyun: "🍜 Ramyun",
      tteokbokki: "🌶️ Tteokbokki",
      drink: "🥤 Drinks",
      addToTray: "+ Add",
      trayTitle: "Your Order",
      emptyTray: "Tap any item to start ordering",
      total: "Total Amount",
      payCash: "💵 Pay Cash",
      payGcash: "📱 GCash / QR Ph",
      payCard: "💳 Card (Counter)",
      cashGuide: "Folded bills accepted — please UNFOLD bills flat, show staff, and drop into the cash box!",
    },
    ko: {
      quickBanner: "⚡ 5초 초고속 세트 (옵션 없이 원터치 담기)",
      all: "전체 메뉴",
      combo: "⚡ 초고속 세트",
      eomuk: "🍢 오뎅",
      cupbap: "🍚 컵밥",
      ramyun: "🍜 라면",
      tteokbokki: "🌶️ 떡볶이",
      drink: "🥤 음료",
      addToTray: "+ 담기",
      trayTitle: "장바구니",
      emptyTray: "원하는 메뉴를 눌러 담아주세요",
      total: "결제 금액",
      payCash: "💵 현금 결제",
      payGcash: "📱 GCash / QR Ph",
      payCard: "💳 카드 (카운터)",
      cashGuide: "지폐를 쫙 펴서 직원에게 보여주신 후 투명 돈통에 넣어주세요.",
    },
    tl: {
      quickBanner: "⚡ 5-Second Quick Combos (Mabilis na Order)",
      all: "Lahat ng Menu",
      combo: "⚡ Quick Combos",
      eomuk: "🍢 Eomuk",
      cupbap: "🍚 Cupbap",
      ramyun: "🍜 Ramyun",
      tteokbokki: "🌶️ Tteokbokki",
      drink: "🥤 Drinks",
      addToTray: "+ Dagdag",
      trayTitle: "Iyong Order",
      emptyTray: "Pindutin ang pagkain para umorder",
      total: "Kabuuang Bayad",
      payCash: "💵 Cash (Sa Box)",
      payGcash: "📱 GCash / QR Ph",
      payCard: "💳 Card (Counter)",
      cashGuide: "Paki-unfold / flat po ang pera bago ipakita sa staff at ilagay sa cash box. Salamat!",
    },
  };

  function toast(msg, type = "info") {
    const wrap = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function playChime() {
    if (!state.soundEnabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const playTone = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.16, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };
      playTone(659.25, now, 0.18);
      playTone(880, now + 0.16, 0.28);
    } catch (e) {
      // Ignore browser autoplay block until user interaction
    }
  }

  async function api(url, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body && typeof opts.body === "object") {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    if (state.adminPin) {
      headers["X-Owner-Pin"] = state.adminPin;
    }
    const res = await fetch(url, { ...opts, headers });
    const data = await res.json().catch(() => ({ ok: false, error: "Invalid server response" }));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function getActiveBranch() {
    const branches = (state.bootstrap && state.bootstrap.branches) || [];
    return branches.find((b) => b.id === state.branchId) || branches[0] || { id: "school-a", name: "1호점", type: "school_stall", default_mode: "pos" };
  }

  function getMenuTitle(item, lang = state.lang) {
    if (lang === "ko") return item.name_ko;
    if (lang === "en") return item.name_en;
    if (lang === "tl") return item.name_tl || item.name_en;
    return `${item.name_ko} · ${item.name_en}`;
  }

  function updateUrlParams() {
    const p = new URLSearchParams();
    p.set("mode", state.mode);
    p.set("branchId", state.branchId);
    if (state.tableLabel) p.set("table", state.tableLabel);
    if (state.kioskLocked) p.set("lock", "1");
    window.history.replaceState({}, "", `${window.location.pathname}?${p.toString()}`);
  }

  // ---------- Bootstrap & SSE ----------
  async function loadBootstrap() {
    const data = await api("/api/bootstrap");
    state.bootstrap = data;
    if (!state.adminDate) state.adminDate = data.businessDate;
    const validBranch = data.branches.find((b) => b.id === state.branchId);
    if (!validBranch && data.branches.length > 0) {
      state.branchId = data.branches[0].id;
    }
    if (!initialModeParam && validBranch) {
      state.mode = validBranch.default_mode || "pos";
    }
    renderHeader();
  }

  async function loadOrders() {
    const data = await api(`/api/orders?branchId=${encodeURIComponent(state.branchId)}`);
    state.orders = data.orders || [];
    updateKdsBadge();
  }

  async function loadPunchCards() {
    const data = await api(`/api/punch-cards?branchId=${encodeURIComponent(state.branchId)}`);
    state.punchCards = data.punchCards || [];
  }

  function updateKdsBadge() {
    const badge = document.getElementById("kds-badge");
    const active = state.orders.filter((o) => ["waiting_payment", "preparing", "ready"].includes(o.order_status)).length;
    if (active > 0) {
      badge.textContent = String(active);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function connectSSE() {
    if (state.sse) state.sse.close();
    const sse = new EventSource(`/api/stream?branchId=all`);
    const pill = document.getElementById("sse-pill");

    sse.addEventListener("connected", () => {
      pill.textContent = "● 실시간 연결";
      pill.classList.remove("offline");
    });

    const handleChange = async (ev, shouldChime = false) => {
      const payload = JSON.parse(ev.data || "{}");
      if (payload.branchId && payload.branchId !== "all" && payload.branchId !== state.branchId && state.mode !== "admin") {
        return;
      }
      if (shouldChime && state.mode === "kitchen") playChime();
      if (["pos", "kitchen", "kiosk"].includes(state.mode)) {
        await loadOrders();
        renderMain();
      } else if (state.mode === "admin" && state.adminPin) {
        await loadAdminDashboard();
        renderMain();
      }
    };

    sse.addEventListener("order_created", (e) => handleChange(e, true));
    sse.addEventListener("order_updated", (e) => handleChange(e, false));
    sse.addEventListener("void_requested", (e) => handleChange(e, true));
    sse.addEventListener("closeout_submitted", (e) => handleChange(e, false));
    sse.addEventListener("stock_updated", (e) => handleChange(e, false));

    sse.onerror = () => {
      pill.textContent = "● 재연결 중...";
      pill.classList.add("offline");
    };
    state.sse = sse;
  }

  // ---------- Header & Navigation ----------
  function renderHeader() {
    const header = document.getElementById("app-header");
    const unlockBtn = document.getElementById("btn-kiosk-unlock");
    const lockBtn = document.getElementById("btn-kiosk-lock");

    document.getElementById("header-shop-name").textContent = (state.bootstrap && state.bootstrap.shopName) || "HM Snacks";
    const activeBranch = getActiveBranch();
    document.getElementById("header-subline").textContent = `${activeBranch.name} · ${(state.bootstrap && state.bootstrap.businessDate) || ""}`;

    const select = document.getElementById("branch-select");
    select.innerHTML = ((state.bootstrap && state.bootstrap.branches) || [])
      .map((b) => `<option value="${esc(b.id)}" ${b.id === state.branchId ? "selected" : ""}>${esc(b.name)}</option>`)
      .join("");

    document.querySelectorAll(".mode-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });

    if (state.mode === "kiosk" && state.kioskLocked) {
      header.classList.add("hidden");
      unlockBtn.classList.remove("hidden");
    } else {
      header.classList.remove("hidden");
      unlockBtn.classList.add("hidden");
    }

    lockBtn.classList.toggle("hidden", state.mode !== "kiosk");
  }

  async function switchMode(newMode) {
    state.mode = newMode;
    updateUrlParams();
    renderHeader();
    if (["pos", "kitchen", "kiosk"].includes(newMode)) {
      await loadOrders();
      if (newMode === "pos") await loadPunchCards();
    } else if (newMode === "admin" && state.adminPin) {
      await loadAdminDashboard();
    }
    renderMain();
  }

  // ---------- Cart Helpers ----------
  function addToCart(menuItem, selectedOptions = []) {
    const optDelta = selectedOptions.reduce((s, o) => s + Number(o.priceDelta || 0), 0);
    const unitPrice = Number(menuItem.price) + optDelta;
    const key = `${menuItem.id}::${selectedOptions.map((o) => `${o.groupId}:${o.optionId}`).sort().join(",")}`;
    const existing = state.cart.find((c) => c.key === key);
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({
        key,
        menuItemId: menuItem.id,
        name_ko: menuItem.name_ko,
        name_en: menuItem.name_en,
        qty: 1,
        unitPrice,
        selectedOptions,
        optionsLabel: selectedOptions.map((o) => o.label_en).join(", "),
      });
    }
    renderMain();
  }

  function updateCartQty(key, delta) {
    const idx = state.cart.findIndex((c) => c.key === key);
    if (idx === -1) return;
    state.cart[idx].qty += delta;
    if (state.cart[idx].qty <= 0) state.cart.splice(idx, 1);
    renderMain();
  }

  function getCartTotal() {
    return state.cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  }

  // ---------- Modal Helper ----------
  function openModal(html) {
    const backdrop = document.getElementById("modal-backdrop");
    const card = document.getElementById("modal-card");
    card.innerHTML = html;
    backdrop.classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.add("hidden");
    document.getElementById("modal-card").innerHTML = "";
  }

  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });

  // ---------- 58mm Thermal Order Slip Preview & Print ----------
  function buildSlipHtml(order) {
    const branch = ((state.bootstrap && state.bootstrap.branches) || []).find((b) => b.id === order.branch_id);
    const lines = (order.items || [])
      .map(
        (it) => `
      <div style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>${esc(it.name_en)} x${it.qty}${it.optionsLabel ? `<br><small>  (${esc(it.optionsLabel)})</small>` : ""}</span>
        <span>${php(it.lineTotal)}</span>
      </div>`
      )
      .join("");
    return `
      <div class="receipt-58mm">
        <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
          <strong style="font-size:13px;">ORDER SLIP ONLY</strong><br>
          <small>NOT AN OFFICIAL BIR INVOICE</small><br>
          <hr style="border:none;border-top:1px dashed #000;margin:4px 0;">
          <strong>${esc((state.bootstrap && state.bootstrap.shopName) || "HM Snacks")}</strong><br>
          <small>${esc((branch && branch.name) || order.branch_id)}</small><br>
          <div style="font-size:20px;font-weight:900;margin:4px 0;">#${order.order_number}</div>
          <small>${esc(order.table_label)} · ${esc(order.source_mode.toUpperCase())}</small>
        </div>
        ${lines}
        <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;">
          <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;">
            <span>TOTAL</span><span>${php(order.total_amount)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span>PAY: ${esc(order.payment_method.toUpperCase())}</span>
            <span>${esc(order.payment_status.toUpperCase())}</span>
          </div>
          ${order.cash_received ? `<div style="display:flex;justify-content:space-between;font-size:11px;"><span>CASH</span><span>${php(order.cash_received)} (CHG ${php(order.change_given || 0)})</span></div>` : ""}
        </div>
        ${
          order.bir_si_required
            ? `<div style="border:1px solid #000;padding:4px;margin-top:6px;font-size:10px;text-align:center;">
                 <strong>BIR ₱500+ REMINDER:</strong><br>Issue manual Sales Invoice booklet upon customer request.
               </div>`
            : ""
        }
        <div style="text-align:center;border-top:1px dashed #000;margin-top:8px;padding-top:6px;font-size:10px;">
          *** INTERNAL ORDER SLIP ONLY ***<br>
          NOT AN OFFICIAL BIR SALES INVOICE<br>
          ${new Date(order.created_at).toLocaleString("en-PH")}
        </div>
      </div>
    `;
  }

  function showOrderSlipModal(order) {
    openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;">🖨️ 58mm 주문표 (BIR 안내 포함)</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.__closeModal()">닫기</button>
      </div>
      ${buildSlipHtml(order)}
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button type="button" class="btn btn-primary" style="flex:1;" id="btn-print-slip">🖨️ 58mm 프린터 인쇄</button>
      </div>
    `);
    document.getElementById("btn-print-slip").onclick = () => {
      document.getElementById("print-area").innerHTML = buildSlipHtml(order);
      window.print();
    };
  }

  window.__closeModal = closeModal;

  // ---------- MODE 1: School Staff 2-Tap POS ----------
  function renderPosMode(container) {
    const branch = getActiveBranch();
    const allItems = ((state.bootstrap && state.bootstrap.menuItems) || []).filter((m) => m.is_available);
    const filtered = allItems.filter((m) => {
      if (state.posFilter === "combo") return m.is_quick_combo;
      if (state.posFilter === "all") return true;
      return m.category === state.posFilter;
    });

    const total = getCartTotal();
    const tendered = state.posTendered > 0 ? state.posTendered : total;
    const change = Math.max(0, tendered - total);
    const bills50 = Math.floor(change / 50);
    const restChange = change % 50;

    const recentOrders = state.orders.slice(0, 10);

    container.innerHTML = `
      <div class="pos-banner">
        <div>
          <h2>⚡ 학교분점 초고속 2-Tap POS — ${esc(branch.name)}</h2>
          <p>10:30 쉬는시간 속도전용: 1탭 담기 → 1탭 결제! (결제 후 삭제 불가 · 컵/꼬치 1:1 자동 차감)</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-gold btn-sm" id="btn-open-punch-modal">🎫 단골 식권 판매/조회 (${state.punchCards.length})</button>
        </div>
      </div>

      <div class="split-workspace">
        <div>
          <div class="filter-bar">
            ${[
              ["combo", "⚡ ₱50 초고속 세트 (팝업없음)"],
              ["all", "전체 메뉴"],
              ["eomuk", "🍢 오뎅"],
              ["cupbap", "🍚 컵밥"],
              ["ramyun", "🍜 라면"],
              ["tteokbokki", "🌶️ 떡볶이"],
              ["drink", "🥤 음료"],
            ]
              .map(
                ([k, label]) =>
                  `<button type="button" class="filter-chip ${state.posFilter === k ? "active" : ""}" data-pos-filter="${k}">${label}</button>`
              )
              .join("")}
          </div>

          ${
            allItems.length === 0
              ? `<div class="card" style="padding:28px;text-align:center;">
                   <h3 style="margin:0 0 6px;">📋 아직 등록된 메뉴가 없습니다</h3>
                   <p style="font-size:13px;color:var(--ink-muted);margin:0 0 14px;">메뉴가 정해지면 <strong>📊 사장님 감시 (PIN 7777) → 🍔 메뉴 등록</strong>에서 바로 추가하실 수 있습니다.</p>
                   <button type="button" class="btn btn-primary" id="btn-pos-go-menu">➕ 메뉴 등록하러 가기</button>
                 </div>`
              : `<div class="pos-grid">
            ${filtered
              .map(
                (item) => `
              <button type="button" class="pos-tile ${item.is_quick_combo ? "combo" : ""}" data-pos-add="${esc(item.id)}">
                <div class="pos-tile-top">
                  <div>
                    <div class="pos-tile-title">${esc(item.name_ko)}</div>
                    <div class="pos-tile-sub">${esc(item.name_en)}</div>
                  </div>
                  ${item.is_quick_combo ? `<span class="pill-tag tag-red">1-TAP</span>` : ""}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;">
                  <span class="pos-tile-price num">${php(item.price)}</span>
                  ${(item.options && item.options.length) ? `<span class="pill-tag tag-neutral" data-pos-opt="${esc(item.id)}" title="옵션 선택">+옵션</span>` : ""}
                </div>
              </button>
            `
              )
              .join("") || `<div style="padding:20px;color:var(--ink-muted);">이 카테고리에 등록된 메뉴가 없습니다.</div>`}
          </div>`
          }

          <div class="card" style="padding:14px;margin-top:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong>📋 방금 찍힌 주문 (직원은 임의 삭제 불가 · 취소는 사장님 PIN 승인 요청)</strong>
              <span class="pill-tag tag-neutral num">오늘 ${state.orders.length}건</span>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr><th>번호</th><th>메뉴</th><th>금액</th><th>결제</th><th>상태</th><th>작업</th></tr>
                </thead>
                <tbody>
                  ${
                    recentOrders.length === 0
                      ? `<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);">오늘 주문 내역이 아직 없습니다.</td></tr>`
                      : recentOrders
                          .map(
                            (o) => `
                    <tr>
                      <td class="num"><strong>#${o.order_number}</strong></td>
                      <td>${o.items.map((i) => `${esc(i.name_ko)}×${i.qty}`).join(", ")}</td>
                      <td class="num"><strong>${php(o.total_amount)}</strong>${o.bir_si_required ? ` <span class="pill-tag tag-gold">₱500+ SI</span>` : ""}</td>
                      <td><span class="pill-tag tag-neutral">${esc(o.payment_method.toUpperCase())}</span></td>
                      <td>
                        ${
                          o.payment_status === "voided"
                            ? `<span class="pill-tag tag-red">취소됨</span>`
                            : o.payment_status === "void_requested"
                            ? `<span class="pill-tag tag-gold">취소승인대기</span>`
                            : `<span class="pill-tag tag-green">${esc(o.order_status)}</span>`
                        }
                      </td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button type="button" class="btn btn-ghost btn-sm" data-print-order="${esc(o.id)}">🖨️</button>
                          ${
                            o.payment_status === "paid"
                              ? `<button type="button" class="btn btn-danger-outline btn-sm" data-void-order="${esc(o.id)}">취소요청</button>`
                              : ""
                          }
                        </div>
                      </td>
                    </tr>`
                          )
                          .join("")
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="card checkout-rail">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">🧾 2-Tap 계산대</h3>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-pos-clear">비우기</button>
          </div>

          <div class="cart-list">
            ${
              state.cart.length === 0
                ? `<div style="text-align:center;padding:24px 8px;color:var(--ink-muted);">왼쪽 메뉴를 1번만 터치하세요!</div>`
                : state.cart
                    .map(
                      (c) => `
                <div class="cart-row">
                  <div>
                    <strong style="font-size:14px;">${esc(c.name_ko)}</strong>
                    ${c.optionsLabel ? `<div style="font-size:11px;color:var(--ink-muted);">${esc(c.optionsLabel)}</div>` : ""}
                    <div class="num" style="font-size:12px;color:var(--primary);font-weight:700;">${php(c.unitPrice)} × ${c.qty} = ${php(c.unitPrice * c.qty)}</div>
                  </div>
                  <div class="qty-controls">
                    <button type="button" class="qty-btn" data-qty-minus="${esc(c.key)}">−</button>
                    <strong class="num">${c.qty}</strong>
                    <button type="button" class="qty-btn" data-qty-plus="${esc(c.key)}">+</button>
                  </div>
                </div>`
                    )
                    .join("")
            }
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:2px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:10px;">
            <strong>합계 금액</strong>
            <strong class="num" style="font-size:26px;color:var(--primary);">${php(total)}</strong>
          </div>

          ${
            total >= 500
              ? `<div class="pill-tag tag-gold" style="width:100%;justify-content:center;padding:6px;margin-bottom:10px;">⚠️ ₱500 이상: 요청 시 수기 Sales Invoice 발행!</div>`
              : ""
          }

          <div class="tender-box">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:12px;">💵 현금 받은 금액 (거스름돈 자동계산)</strong>
              <input type="number" id="pos-tender-input" class="input num" style="width:100px;padding:4px 8px;font-weight:800;" value="${total > 0 ? tendered : 0}" min="0" />
            </div>
            <div class="tender-presets">
              <button type="button" class="tender-btn ${state.posTendered === 0 ? "active" : ""}" data-tender="0">딱 맞게</button>
              <button type="button" class="tender-btn ${state.posTendered === 100 ? "active" : ""}" data-tender="100">₱100</button>
              <button type="button" class="tender-btn ${state.posTendered === 200 ? "active" : ""}" data-tender="200">₱200</button>
              <button type="button" class="tender-btn ${state.posTendered === 500 ? "active" : ""}" data-tender="500">₱500</button>
            </div>
            ${
              total > 0
                ? `<div class="change-callout num">
                     <span>거스름돈</span>
                     <span>${php(change)}${bills50 > 0 ? ` (₱50×${bills50}장${restChange ? ` + ₱${restChange}` : ""})` : ""}</span>
                   </div>`
                : ""
            }
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin-bottom:10px;cursor:pointer;">
            <input type="checkbox" id="chk-pos-instant" ${state.posInstantComplete ? "checked" : ""} />
            ⚡ 쉬는시간 즉시 배식 (바로 완료 처리)
          </label>

          <div class="checkout-actions">
            <button type="button" class="btn btn-green btn-lg full-span" id="btn-pos-cash" ${total === 0 ? "disabled" : ""}>
              💵 현금확인 완료 (Drop-Box OK)
            </button>
            <button type="button" class="btn btn-blue" id="btn-pos-gcash" ${total === 0 ? "disabled" : ""}>
              📱 GCash / QR Ph
            </button>
            <button type="button" class="btn btn-ghost" id="btn-pos-card" ${total === 0 ? "disabled" : ""}>
              💳 카드 단말기
            </button>
            <button type="button" class="btn btn-gold full-span" id="btn-pos-punch" ${total === 0 ? "disabled" : ""}>
              🎫 단골 식권 차감 (${total > 0 ? Math.max(1, Math.ceil(total / 50)) : 0}칸)
            </button>
          </div>
        </aside>
      </div>
    `;

    if (document.getElementById("btn-pos-go-menu")) {
      document.getElementById("btn-pos-go-menu").onclick = () => {
        state.adminTab = "menu";
        switchMode("admin");
      };
    }

    container.querySelectorAll("[data-pos-filter]").forEach((btn) => {
      btn.onclick = () => {
        state.posFilter = btn.dataset.posFilter;
        renderMain();
      };
    });

    container.querySelectorAll("[data-pos-add]").forEach((tile) => {
      tile.onclick = (e) => {
        const optTrigger = e.target.closest("[data-pos-opt]");
        const item = allItems.find((m) => m.id === tile.dataset.posAdd);
        if (!item) return;
        if (optTrigger) {
          e.stopPropagation();
          openItemOptionsModal(item);
        } else {
          addToCart(item, []);
        }
      };
    });

    container.querySelectorAll("[data-qty-minus]").forEach((b) => (b.onclick = () => updateCartQty(b.dataset.qtyMinus, -1)));
    container.querySelectorAll("[data-qty-plus]").forEach((b) => (b.onclick = () => updateCartQty(b.dataset.qtyPlus, 1)));
    container.querySelectorAll("[data-tender]").forEach((b) => {
      b.onclick = () => {
        state.posTendered = Number(b.dataset.tender);
        renderMain();
      };
    });

    const tenderInput = document.getElementById("pos-tender-input");
    if (tenderInput) {
      tenderInput.onchange = () => {
        state.posTendered = Math.max(0, Number(tenderInput.value || 0));
        renderMain();
      };
    }

    document.getElementById("chk-pos-instant").onchange = (e) => {
      state.posInstantComplete = e.target.checked;
    };

    document.getElementById("btn-pos-clear").onclick = () => {
      state.cart = [];
      state.posTendered = 0;
      renderMain();
    };

    const submitPosOrder = async (paymentMethod, extra = {}) => {
      try {
        const cashRec = paymentMethod === "cash" ? (state.posTendered > 0 ? state.posTendered : total) : undefined;
        const res = await api("/api/orders", {
          method: "POST",
          body: {
            branchId: state.branchId,
            sourceMode: "pos",
            tableLabel: "Counter",
            paymentMethod,
            cashReceived: cashRec,
            instantComplete: state.posInstantComplete,
            punchCardCode: extra.punchCardCode,
            items: state.cart.map((c) => ({
              menuItemId: c.menuItemId,
              qty: c.qty,
              selectedOptions: c.selectedOptions.map((o) => ({ groupId: o.groupId, optionId: o.optionId })),
            })),
          },
        });
        state.cart = [];
        state.posTendered = 0;
        await loadOrders();
        if (paymentMethod === "punch_card") await loadPunchCards();
        renderMain();
        toast(`✅ 주문 #${res.order.order_number} 기록 완료! (${php(res.order.total_amount)})`, "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };

    document.getElementById("btn-pos-cash").onclick = () => submitPosOrder("cash");
    document.getElementById("btn-pos-card").onclick = () => submitPosOrder("card");
    document.getElementById("btn-pos-gcash").onclick = () => {
      openModal(`
        <h3 style="margin-top:0;">📱 GCash / QR Ph 결제 확인</h3>
        <p style="color:var(--ink-muted);font-size:13px;">사운드박스 입금 음성 또는 고객 앱 결제완료 화면을 확인한 후 완료 버튼을 누르세요.</p>
        <div style="text-align:center;background:var(--surface-alt);padding:16px;border-radius:12px;margin:12px 0;">
          <div style="font-size:24px;font-weight:900;color:var(--primary);" class="num">${php(total)}</div>
          <div style="margin:10px auto;display:inline-block;">${KSnackQR.generateQrSvg(`GCASH:${branch.gcash_number || state.bootstrap.signageGcashNumber}|AMT:${total}`, 160)}</div>
          <div style="font-size:12px;font-weight:700;">${esc(branch.gcash_number || state.bootstrap.signageGcashNumber)}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-ghost" style="flex:1;" onclick="window.__closeModal()">취소</button>
          <button type="button" class="btn btn-blue" style="flex:2;" id="btn-confirm-pos-gcash">✅ 입금 확인 및 기록</button>
        </div>
      `);
      document.getElementById("btn-confirm-pos-gcash").onclick = async () => {
        closeModal();
        await submitPosOrder("gcash");
      };
    };

    document.getElementById("btn-pos-punch").onclick = () => openPunchCardRedeemModal(total, submitPosOrder);
    document.getElementById("btn-open-punch-modal").onclick = () => openPunchCardIssueModal();

    container.querySelectorAll("[data-print-order]").forEach((btn) => {
      btn.onclick = () => {
        const ord = state.orders.find((o) => o.id === btn.dataset.printOrder);
        if (ord) showOrderSlipModal(ord);
      };
    });

    container.querySelectorAll("[data-void-order]").forEach((btn) => {
      btn.onclick = () => openVoidRequestModal(btn.dataset.voidOrder);
    });
  }

  function openPunchCardIssueModal() {
    openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;">🎫 학교 단골 식권(펀치카드) 발급 & 조회</h3>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.__closeModal()">닫기</button>
      </div>
      <p style="font-size:12px;color:var(--ink-muted);margin-top:0;">아침 등교 시간에 미리 현금/GCash로 식권을 팔면, 10:30 쉬는시간에 돈 만질 필요 없이 1초 차감됩니다! (1칸 = ₱50 기준)</p>
      <div class="form-grid" style="margin-bottom:12px;">
        <div class="field">
          <label>학생 이름 / 반</label>
          <input id="pc-name" class="input" placeholder="예: Marco (G10-B)" />
        </div>
        <div class="field">
          <label>패키지 선택</label>
          <select id="pc-pkg" class="input">
            <option value="200">₱200 권 (4칸 · ₱50×4)</option>
            <option value="500">₱500 권 (10칸 · ₱50×10)</option>
          </select>
        </div>
        <div class="field">
          <label>선결제 수단</label>
          <select id="pc-pay" class="input">
            <option value="cash">💵 현금 (Cash Box)</option>
            <option value="gcash">📱 GCash</option>
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-primary" style="width:100%;margin-bottom:14px;" id="btn-create-pc">🎫 새 식권 발급 및 매출 기록</button>
      <div style="max-height:200px;overflow-y:auto;border-top:1px solid var(--border);padding-top:10px;">
        <strong style="font-size:12px;">이 지점 발급 식권 목록</strong>
        ${state.punchCards
          .map(
            (p) => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span><strong>${esc(p.code)}</strong> · ${esc(p.student_name)}</span>
            <span class="num"><strong>${p.remaining_punches}/${p.total_punches}칸</strong></span>
          </div>`
          )
          .join("") || `<div style="font-size:12px;color:var(--ink-muted);padding:8px 0;">발급된 식권이 없습니다.</div>`}
      </div>
    `);
    document.getElementById("btn-create-pc").onclick = async () => {
      try {
        const studentName = document.getElementById("pc-name").value.trim();
        const packagePrice = Number(document.getElementById("pc-pkg").value);
        const paymentMethod = document.getElementById("pc-pay").value;
        const res = await api("/api/punch-cards", {
          method: "POST",
          body: { branchId: state.branchId, studentName, packagePrice, paymentMethod },
        });
        await loadPunchCards();
        closeModal();
        toast(`🎫 식권 ${res.punchCard.code} 발급 완료!`, "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }

  function openPunchCardRedeemModal(total, submitFn) {
    const needed = Math.max(1, Math.ceil(total / 50));
    openModal(`
      <h3 style="margin-top:0;">🎫 단골 식권 차감 (${needed}칸 필요)</h3>
      <div class="field" style="margin-bottom:12px;">
        <label>식권 번호 입력 또는 아래에서 선택</label>
        <input id="pc-redeem-code" class="input" placeholder="예: PC-101" value="${esc((state.punchCards[0] && state.punchCards[0].code) || "")}" />
      </div>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:14px;">
        ${state.punchCards
          .map(
            (p) => `
          <button type="button" class="btn btn-ghost btn-sm" style="width:100%;justify-content:space-between;margin-bottom:6px;" data-pick-pc="${esc(p.code)}">
            <span><strong>${esc(p.code)}</strong> (${esc(p.student_name)})</span>
            <span class="num">${p.remaining_punches}칸 남음</span>
          </button>`
          )
          .join("")}
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-ghost" style="flex:1;" onclick="window.__closeModal()">취소</button>
        <button type="button" class="btn btn-gold" style="flex:2;" id="btn-confirm-pc-redeem">✅ ${needed}칸 차감 & 주문완료</button>
      </div>
    `);
    document.querySelectorAll("[data-pick-pc]").forEach((b) => {
      b.onclick = () => (document.getElementById("pc-redeem-code").value = b.dataset.pickPc);
    });
    document.getElementById("btn-confirm-pc-redeem").onclick = async () => {
      const code = document.getElementById("pc-redeem-code").value.trim();
      if (!code) return toast("식권 번호를 입력하세요.", "error");
      closeModal();
      await submitFn("punch_card", { punchCardCode: code });
    };
  }

  function openVoidRequestModal(orderId) {
    openModal(`
      <h3 style="margin-top:0;">🚫 주문 취소(Void) 승인 요청</h3>
      <p style="font-size:13px;color:var(--ink-muted);">알바생 횡령 방지를 위해 직원은 주문을 삭제할 수 없습니다. 사유를 제출하면 사장님 폰(PIN 승인)에서 확인 후 처리됩니다.</p>
      <div class="field" style="margin-bottom:10px;">
        <label>취소 사유</label>
        <select id="void-reason" class="input">
          <option value="손님 미결제 이탈 (No Payment)">손님 미결제 이탈 (No Payment)</option>
          <option value="직원 오입력 (Wrong Entry)">직원 오입력 (Wrong Entry)</option>
          <option value="재료 소진 / 조리 불가 (Out of Stock)">재료 소진 / 조리 불가</option>
          <option value="조리 실수 폐기 (Spoiled)">조리 실수 폐기 (사진 보관)</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:14px;">
        <label>상세 메모 (사장님 확인용)</label>
        <input id="void-note" class="input" placeholder="예: 실수로 2번 눌렀음 / 손님이 안 오고 감" />
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-ghost" style="flex:1;" onclick="window.__closeModal()">닫기</button>
        <button type="button" class="btn btn-primary" style="flex:2;" id="btn-submit-void">사장님께 승인 요청 보내기</button>
      </div>
    `);
    document.getElementById("btn-submit-void").onclick = async () => {
      try {
        await api(`/api/orders/${orderId}/void-request`, {
          method: "POST",
          body: {
            reason: document.getElementById("void-reason").value,
            staffNote: document.getElementById("void-note").value,
          },
        });
        closeModal();
        await loadOrders();
        renderMain();
        toast("취소 승인 요청이 사장님 대시보드/텔레그램으로 전송되었습니다.", "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }

  // ---------- MODE 2: Customer Self-Kiosk & Table QR ----------
  function openItemOptionsModal(item) {
    const groups = item.options || [];
    const selected = {};
    for (const g of groups) {
      if ((g.choices && g.choices.length)) selected[g.id] = g.choices[0];
    }

    const renderModalContent = () => {
      const delta = Object.values(selected).reduce((s, c) => s + Number((c && c.priceDelta) || 0), 0);
      openModal(`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <h3 style="margin:0;">${esc(getMenuTitle(item))}</h3>
            <p style="margin:4px 0 0;color:var(--ink-muted);font-size:13px;">${esc(item.description_en || "")}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.__closeModal()">✕</button>
        </div>
        <div style="height:140px;border-radius:12px;overflow:hidden;margin:12px 0;">${KSnackFoodArt.getFoodVisualHtml(item)}</div>
        ${groups
          .map(
            (g) => `
          <div style="margin-bottom:12px;">
            <strong style="display:block;font-size:13px;margin-bottom:6px;">${esc(g.label_ko)} / ${esc(g.label_en)}</strong>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${g.choices
                .map((ch) => {
                  const isSel = (selected[g.id] && selected[g.id].id) === ch.id;
                  return `<button type="button" class="filter-chip ${isSel ? "active" : ""}" data-opt-g="${esc(g.id)}" data-opt-c="${esc(ch.id)}">${esc(ch.label_en)} ${ch.priceDelta ? `(+${php(ch.priceDelta)})` : ""}</button>`;
                })
                .join("")}
            </div>
          </div>`
          )
          .join("")}
        <button type="button" class="btn btn-primary btn-lg" style="width:100%;" id="btn-add-with-opts">
          ${I18N[state.lang].addToTray} · <span class="num">${php(item.price + delta)}</span>
        </button>
      `);
      document.querySelectorAll("[data-opt-g]").forEach((btn) => {
        btn.onclick = () => {
          const grp = groups.find((g) => g.id === btn.dataset.optG);
          const ch = grp && grp.choices.find((c) => c.id === btn.dataset.optC);
          if (ch) selected[grp.id] = ch;
          renderModalContent();
        };
      });
      document.getElementById("btn-add-with-opts").onclick = () => {
        const list = Object.entries(selected).map(([groupId, ch]) => ({
          groupId,
          optionId: ch.id,
          label_ko: ch.label_ko,
          label_en: ch.label_en,
          priceDelta: ch.priceDelta,
        }));
        closeModal();
        addToCart(item, list);
      };
    };
    renderModalContent();
  }

  function renderKioskMode(container) {
    const t = I18N[state.lang] || I18N.ko_en;
    const branch = getActiveBranch();
    const allItems = ((state.bootstrap && state.bootstrap.menuItems) || []).filter((m) => m.is_available);
    const quickCombos = allItems.filter((m) => m.is_quick_combo);
    const filtered = allItems.filter((m) => state.kioskFilter === "all" || m.category === state.kioskFilter);
    const total = getCartTotal();

    container.innerHTML = `
      <div class="pos-banner">
        <div>
          <h2>${esc((state.bootstrap && state.bootstrap.shopName) || "HM Snacks")} ${state.tableLabel ? `<span class="pill-tag tag-gold">📍 ${esc(state.tableLabel)}</span>` : ""}</h2>
          <p>${esc(branch.name)} · Self-Order Kiosk & Mobile QR</p>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${[
            ["ko_en", "EN+한"],
            ["en", "English"],
            ["ko", "한국어"],
            ["tl", "Taglish"],
          ]
            .map(
              ([code, label]) =>
                `<button type="button" class="btn btn-sm ${state.lang === code ? "btn-primary" : "btn-ghost"}" data-lang="${code}">${label}</button>`
            )
            .join("")}
        </div>
      </div>

      ${
        state.lastCreatedOrder
          ? `<div class="card" style="padding:16px;margin-bottom:14px;border:2px solid var(--green);background:var(--green-soft);">
               <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
                 <div>
                   <span class="pill-tag tag-green">ORDER CONFIRMED</span>
                   <h3 style="margin:4px 0;font-size:22px;">주문번호 <span class="num">#${state.lastCreatedOrder.order_number}</span> · ${php(state.lastCreatedOrder.total_amount)}</h3>
                   <p style="margin:0;font-size:13px;">
                     ${
                       state.lastCreatedOrder.payment_status === "paid"
                         ? "✅ 결제 확인 완료! 바로 주방에서 조리를 시작했습니다. 번호가 호출될 때까지 기다려주세요."
                         : state.lastCreatedOrder.payment_method === "cash"
                         ? "💵 카운터에서 지폐를 펴서 직원에게 보여주시고 투명 돈통에 넣어주시면 바로 조리합니다!"
                         : "💳 카운터 단말기에서 카드를 태그해 주시면 바로 조리합니다!"
                     }
                   </p>
                 </div>
                 <div style="display:flex;gap:8px;">
                   <button type="button" class="btn btn-ghost btn-sm" id="btn-kiosk-slip">🖨️ 58mm 주문표</button>
                   <button type="button" class="btn btn-green btn-sm" id="btn-kiosk-dismiss">새 주문하기</button>
                 </div>
               </div>
             </div>`
          : ""
      }

      <div class="split-workspace">
        <div>
          <!-- 5-Second Quick Combos Bar -->
          <div class="card" style="padding:12px;margin-bottom:14px;background:var(--surface-warm);border-color:#ebc28b;">
            <strong style="display:block;font-size:14px;margin-bottom:8px;">${t.quickBanner}</strong>
            <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">
              ${quickCombos
                .map(
                  (q) => `
                <button type="button" class="btn btn-ghost" style="flex:0 0 auto;background:#fff;border-color:#e4b578;flex-direction:column;align-items:flex-start;padding:8px 12px;" data-quick-add="${esc(q.id)}">
                  <span style="font-size:13px;">${esc(getMenuTitle(q))}</span>
                  <span class="num" style="color:var(--primary);font-size:15px;">${php(q.price)}</span>
                </button>`
                )
                .join("")}
            </div>
          </div>

          <div class="filter-bar">
            ${[
              ["all", t.all],
              ["combo", t.combo],
              ["eomuk", t.eomuk],
              ["cupbap", t.cupbap],
              ["ramyun", t.ramyun],
              ["tteokbokki", t.tteokbokki],
              ["drink", t.drink],
            ]
              .map(
                ([k, label]) =>
                  `<button type="button" class="filter-chip ${state.kioskFilter === k ? "active" : ""}" data-kiosk-filter="${k}">${label}</button>`
              )
              .join("")}
          </div>

          ${
            allItems.length === 0
              ? `<div class="card" style="padding:28px;text-align:center;">
                   <h3 style="margin:0 0 6px;">📋 아직 등록된 메뉴가 없습니다 (No Menu Yet)</h3>
                   <p style="font-size:13px;color:var(--ink-muted);margin:0 0 14px;">사장님 관리(PIN 7777)에서 메뉴를 등록하면 바로 표시됩니다.</p>
                   ${state.kioskLocked ? "" : `<button type="button" class="btn btn-primary" id="btn-kiosk-go-menu">➕ 메뉴 등록하러 가기</button>`}
                 </div>`
              : `<div class="kiosk-grid">
            ${filtered
              .map(
                (item) => `
              <div class="menu-card" data-kiosk-item="${esc(item.id)}">
                <div class="menu-visual">
                  ${KSnackFoodArt.getFoodVisualHtml(item)}
                  ${item.is_quick_combo ? `<span class="quick-badge">⚡ 5-SEC</span>` : ""}
                </div>
                <div class="menu-card-body">
                  <div>
                    <h4 class="menu-card-title">${esc(getMenuTitle(item))}</h4>
                    <div class="menu-card-sub">${esc(item.description_en || "")}</div>
                  </div>
                  <div class="menu-card-foot">
                    <span class="menu-price num">${php(item.price)}</span>
                    <span class="btn btn-primary btn-sm">${t.addToTray}</span>
                  </div>
                </div>
              </div>`
              )
              .join("") || `<div style="padding:20px;color:var(--ink-muted);">해당 카테고리에 메뉴가 없습니다.</div>`}
          </div>`
          }
        </div>

        <aside class="card checkout-rail">
          <h3 style="margin-top:0;">🛒 ${t.trayTitle}</h3>
          <div class="cart-list">
            ${
              state.cart.length === 0
                ? `<div style="text-align:center;padding:24px 8px;color:var(--ink-muted);">${t.emptyTray}</div>`
                : state.cart
                    .map(
                      (c) => `
                <div class="cart-row">
                  <div>
                    <strong style="font-size:14px;">${esc(getMenuTitle({ name_ko: c.name_ko, name_en: c.name_en, name_tl: c.name_en }))}</strong>
                    ${c.optionsLabel ? `<div style="font-size:11px;color:var(--ink-muted);">${esc(c.optionsLabel)}</div>` : ""}
                    <div class="num" style="font-size:13px;color:var(--primary);font-weight:700;">${php(c.unitPrice * c.qty)}</div>
                  </div>
                  <div class="qty-controls">
                    <button type="button" class="qty-btn" data-qty-minus="${esc(c.key)}">−</button>
                    <strong class="num">${c.qty}</strong>
                    <button type="button" class="qty-btn" data-qty-plus="${esc(c.key)}">+</button>
                  </div>
                </div>`
                    )
                    .join("")
            }
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:2px solid var(--border);margin-bottom:10px;">
            <strong>${t.total}</strong>
            <strong class="num" style="font-size:26px;color:var(--primary);">${php(total)}</strong>
          </div>

          <div style="background:var(--surface-warm);border:1px solid #ebd2ad;border-radius:10px;padding:10px;font-size:12px;margin-bottom:12px;">
            💵 <strong>Cash Drop-Box 안내:</strong> ${esc(t.cashGuide)}
          </div>

          <div class="checkout-actions">
            <button type="button" class="btn btn-green btn-lg full-span" id="btn-kiosk-cash" ${total === 0 ? "disabled" : ""}>${t.payCash}</button>
            <button type="button" class="btn btn-blue btn-lg full-span" id="btn-kiosk-gcash" ${total === 0 ? "disabled" : ""}>${t.payGcash}</button>
            <button type="button" class="btn btn-ghost full-span" id="btn-kiosk-card" ${total === 0 ? "disabled" : ""}>${t.payCard}</button>
          </div>
          <div style="text-align:center;font-size:11px;color:var(--ink-muted);margin-top:10px;">
            ORDER SLIP ONLY — NOT AN OFFICIAL BIR INVOICE
          </div>
        </aside>
      </div>
    `;

    if (document.getElementById("btn-kiosk-go-menu")) {
      document.getElementById("btn-kiosk-go-menu").onclick = () => {
        state.adminTab = "menu";
        switchMode("admin");
      };
    }
    container.querySelectorAll("[data-lang]").forEach((b) => {
      b.onclick = () => {
        state.lang = b.dataset.lang;
        localStorage.setItem("ksnack_lang", state.lang);
        renderMain();
      };
    });
    container.querySelectorAll("[data-kiosk-filter]").forEach((b) => {
      b.onclick = () => {
        state.kioskFilter = b.dataset.kioskFilter;
        renderMain();
      };
    });
    container.querySelectorAll("[data-quick-add]").forEach((b) => {
      b.onclick = () => {
        const item = allItems.find((m) => m.id === b.dataset.quickAdd);
        if (item) addToCart(item, []);
      };
    });
    container.querySelectorAll("[data-kiosk-item]").forEach((card) => {
      card.onclick = () => {
        const item = allItems.find((m) => m.id === card.dataset.kioskItem);
        if (!item) return;
        if ((item.options && item.options.length) && !item.is_quick_combo) openItemOptionsModal(item);
        else addToCart(item, []);
      };
    });
    container.querySelectorAll("[data-qty-minus]").forEach((b) => (b.onclick = () => updateCartQty(b.dataset.qtyMinus, -1)));
    container.querySelectorAll("[data-qty-plus]").forEach((b) => (b.onclick = () => updateCartQty(b.dataset.qtyPlus, 1)));

    if (document.getElementById("btn-kiosk-slip")) {
      document.getElementById("btn-kiosk-slip").onclick = () => showOrderSlipModal(state.lastCreatedOrder);
    }
    if (document.getElementById("btn-kiosk-dismiss")) {
      document.getElementById("btn-kiosk-dismiss").onclick = () => {
        state.lastCreatedOrder = null;
        renderMain();
      };
    }

    const placeKioskOrder = async (paymentMethod) => {
      try {
        const res = await api("/api/orders", {
          method: "POST",
          body: {
            branchId: state.branchId,
            sourceMode: state.tableLabel ? "table_qr" : "kiosk",
            tableLabel: state.tableLabel || "Counter Kiosk",
            paymentMethod,
            items: state.cart.map((c) => ({
              menuItemId: c.menuItemId,
              qty: c.qty,
              selectedOptions: c.selectedOptions.map((o) => ({ groupId: o.groupId, optionId: o.optionId })),
            })),
          },
        });
        state.cart = [];
        state.lastCreatedOrder = res.order;
        await loadOrders();
        renderMain();

        if (paymentMethod === "gcash") {
          await openKioskQrPhModal(res.order);
        }
      } catch (err) {
        toast(err.message, "error");
      }
    };

    document.getElementById("btn-kiosk-cash").onclick = () => placeKioskOrder("cash");
    document.getElementById("btn-kiosk-gcash").onclick = () => placeKioskOrder("gcash");
    document.getElementById("btn-kiosk-card").onclick = () => placeKioskOrder("card");
  }

  async function openKioskQrPhModal(order) {
    const branch = getActiveBranch();
    const pmRes = await api("/api/payments/paymongo-qr", {
      method: "POST",
      body: { orderId: order.id },
    });

    const qrVisual = branch.qr_image_url
      ? `<img src="${esc(branch.qr_image_url)}" alt="Store QR Ph" style="max-width:210px;border-radius:12px;border:1px solid var(--border);"/>`
      : KSnackQR.generateQrSvg(pmRes.qrPayload, 200);

    openModal(`
      <div style="text-align:center;">
        <span class="pill-tag tag-blue">GCash / Maya / QR Ph</span>
        <h3 style="margin:8px 0 4px;">주문번호 #${order.order_number} · <span class="num" style="color:var(--primary);">${php(order.total_amount)}</span></h3>
        <p style="font-size:12px;color:var(--ink-muted);margin:0 0 12px;">
          ${pmRes.liveApiUsed ? "PayMongo 동적 QR Ph 발급됨 — 입금 즉시 자동 조리 시작!" : "QR 스캔 후 송금해 주세요. (사운드박스 확인 또는 PayMongo 자동 웹훅 연동 지원)"}
        </p>
        ${pmRes.warning ? `<div class="pill-tag tag-gold" style="margin-bottom:8px;">${esc(pmRes.warning)}</div>` : ""}
        <div style="padding:14px;background:var(--surface-alt);border-radius:14px;display:inline-block;margin-bottom:12px;">
          ${qrVisual}
          <div style="font-size:12px;font-weight:700;margin-top:6px;">${esc(state.bootstrap.signageGcashName)} (${esc(branch.gcash_number || state.bootstrap.signageGcashNumber)})</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" class="btn btn-green" id="btn-sim-paymongo">⚡ PayMongo 자동입금 시뮬레이션 (직원 확인 없이 바로 조리!)</button>
          <button type="button" class="btn btn-ghost" onclick="window.__closeModal()">닫고 카운터 사운드박스로 확인하기</button>
        </div>
      </div>
    `);

    document.getElementById("btn-sim-paymongo").onclick = async () => {
      try {
        const res = await api("/api/payments/simulate-webhook", {
          method: "POST",
          body: { orderId: order.id },
        });
        state.lastCreatedOrder = res.order;
        closeModal();
        await loadOrders();
        renderMain();
        toast(`📱 주문 #${order.order_number} QR Ph 자동입금 확인 → 주방 조리 시작!`, "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }

  // ---------- MODE 3: Kitchen & Pickup KDS ----------
  function renderKitchenMode(container) {
    const branch = getActiveBranch();
    const unpaid = state.orders.filter((o) => o.order_status === "waiting_payment");
    const preparing = state.orders.filter((o) => o.order_status === "preparing");
    const ready = state.orders.filter((o) => o.order_status === "ready");

    if (state.kdsSubView === "pickup_tv") {
      container.innerHTML = `
        <div class="pos-banner">
          <div>
            <h2>📺 손님 픽업 호출 번호판 — ${esc(branch.name)}</h2>
            <p>보조 태블릿이나 모니터에 띄워두시면 학생/손님이 번호를 보고 바로 찾아갑니다.</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-back-kds">🍳 주방 화면으로</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="card" style="padding:24px;border:3px solid var(--gold);">
            <h2 style="margin-top:0;color:var(--gold);">🔥 조리 중 (Preparing)</h2>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
              ${preparing.map((o) => `<div style="font-size:38px;font-weight:900;padding:12px 22px;background:var(--gold-soft);border-radius:14px;" class="num">#${o.order_number}</div>`).join("") || `<p style="color:var(--ink-muted);">대기 중인 조리가 없습니다.</p>`}
            </div>
          </div>
          <div class="card" style="padding:24px;border:3px solid var(--green);">
            <h2 style="margin-top:0;color:var(--green);">🛎️ 픽업하세요! (Ready Now)</h2>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
              ${ready.map((o) => `<div style="font-size:48px;font-weight:900;padding:14px 26px;background:var(--green);color:#fff;border-radius:16px;" class="num">#${o.order_number}</div>`).join("") || `<p style="color:var(--ink-muted);">호출 중인 주문이 없습니다.</p>`}
            </div>
          </div>
        </div>
      `;
      document.getElementById("btn-back-kds").onclick = () => {
        state.kdsSubView = "board";
        renderMain();
      };
      return;
    }

    const renderOrderCard = (o, colType) => {
      const mins = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000));
      return `
        <div class="kds-card ${colType}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong class="num" style="font-size:22px;">#${o.order_number}</strong>
            <div style="display:flex;gap:4px;align-items:center;">
              <span class="pill-tag tag-neutral">${esc(o.table_label)}</span>
              <span class="pill-tag tag-neutral num">${mins}분</span>
            </div>
          </div>
          <div style="margin-bottom:8px;">
            ${o.items
              .map(
                (i) => `
              <div style="font-size:14px;font-weight:700;padding:2px 0;">
                • ${esc(i.name_ko)} <span style="color:var(--primary);">× ${i.qty}</span>
                ${i.optionsLabel ? `<div style="font-size:12px;color:var(--ink-muted);margin-left:10px;">↳ ${esc(i.optionsLabel)}</div>` : ""}
              </div>`
              )
              .join("")}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:10px;">
            <strong class="num" style="font-size:15px;">${php(o.total_amount)} (${esc(o.payment_method.toUpperCase())})</strong>
            ${o.bir_si_required ? `<span class="pill-tag tag-gold">⚠️ ₱500+ 수기 SI</span>` : ""}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${
              colType === "unpaid"
                ? `
              <button type="button" class="btn btn-green btn-sm" style="flex:1;" data-kds-confirm="${esc(o.id)}" data-pay="cash">💵 현금확인</button>
              <button type="button" class="btn btn-blue btn-sm" style="flex:1;" data-kds-confirm="${esc(o.id)}" data-pay="gcash">📱 GCash확인</button>
              <button type="button" class="btn btn-ghost btn-sm" data-kds-confirm="${esc(o.id)}" data-pay="card">💳 카드</button>
            `
                : colType === "preparing"
                ? `<button type="button" class="btn btn-green btn-sm" style="flex:1;" data-kds-status="${esc(o.id)}" data-next="ready">✅ 조리완료 → 픽업</button>`
                : `<button type="button" class="btn btn-primary btn-sm" style="flex:1;" data-kds-status="${esc(o.id)}" data-next="completed">📦 전달완료</button>`
            }
            <button type="button" class="btn btn-ghost btn-sm" data-kds-print="${esc(o.id)}">🖨️</button>
            ${
              o.payment_status !== "void_requested"
                ? `<button type="button" class="btn btn-danger-outline btn-sm" data-kds-void="${esc(o.id)}">취소요청</button>`
                : `<span class="pill-tag tag-gold">취소승인대기</span>`
            }
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      <div class="pos-banner">
        <div>
          <h2>🍳 주방 & 카운터 KDS — ${esc(branch.name)}</h2>
          <p>철칙: 주문번호표가 결제 확인되기 전에는 절대 음식을 만들지 마세요! (직원은 삭제 불가 · 취소요청만 가능)</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-sound">${state.soundEnabled ? "🔊 띵동 알림 ON" : "🔇 알림 OFF"}</button>
          <button type="button" class="btn btn-gold btn-sm" id="btn-pickup-tv">📺 손님 호출 번호판</button>
        </div>
      </div>

      <div class="kds-grid">
        <section class="card kds-col">
          <div class="kds-col-head">
            <strong style="color:#b45309;">💵 결제 확인 대기 (${unpaid.length})</strong>
            <span class="pill-tag tag-gold">조리 금지!</span>
          </div>
          ${unpaid.map((o) => renderOrderCard(o, "unpaid")).join("") || `<p style="color:var(--ink-muted);text-align:center;margin-top:40px;">미확인 대기 주문 없음</p>`}
        </section>

        <section class="card kds-col">
          <div class="kds-col-head">
            <strong style="color:var(--primary);">🔥 조리 중 (${preparing.length})</strong>
            <span class="pill-tag tag-red">결제됨</span>
          </div>
          ${preparing.map((o) => renderOrderCard(o, "preparing")).join("") || `<p style="color:var(--ink-muted);text-align:center;margin-top:40px;">조리 중인 주문 없음</p>`}
        </section>

        <section class="card kds-col">
          <div class="kds-col-head">
            <strong style="color:var(--green);">🛎️ 픽업 대기 (${ready.length})</strong>
            <span class="pill-tag tag-green">번호 호출</span>
          </div>
          ${ready.map((o) => renderOrderCard(o, "ready")).join("") || `<p style="color:var(--ink-muted);text-align:center;margin-top:40px;">픽업 대기 주문 없음</p>`}
        </section>
      </div>
    `;

    document.getElementById("btn-toggle-sound").onclick = () => {
      state.soundEnabled = !state.soundEnabled;
      renderMain();
    };
    document.getElementById("btn-pickup-tv").onclick = () => {
      state.kdsSubView = "pickup_tv";
      renderMain();
    };
    container.querySelectorAll("[data-kds-confirm]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api(`/api/orders/${btn.dataset.kdsConfirm}/confirm-payment`, {
            method: "POST",
            body: { paymentMethod: btn.dataset.pay },
          });
          await loadOrders();
          renderMain();
          toast("결제 확인 완료 → 조리 시작!", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
    container.querySelectorAll("[data-kds-status]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api(`/api/orders/${btn.dataset.kdsStatus}/status`, {
            method: "POST",
            body: { orderStatus: btn.dataset.next },
          });
          await loadOrders();
          renderMain();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
    container.querySelectorAll("[data-kds-print]").forEach((btn) => {
      btn.onclick = () => {
        const ord = state.orders.find((o) => o.id === btn.dataset.kdsPrint);
        if (ord) showOrderSlipModal(ord);
      };
    });
    container.querySelectorAll("[data-kds-void]").forEach((btn) => {
      btn.onclick = () => openVoidRequestModal(btn.dataset.kdsVoid);
    });
  }

  // ---------- MODE 4: True Blind Closeout ----------
  function renderCloseoutMode(container) {
    const branch = getActiveBranch();
    const invItems = (state.bootstrap && state.bootstrap.inventoryItems) || [];
    const denoms = [
      { key: "1000", label: "₱1,000 지폐" },
      { key: "500", label: "₱500 지폐" },
      { key: "200", label: "₱200 지폐" },
      { key: "100", label: "₱100 지폐" },
      { key: "50", label: "₱50 지폐" },
      { key: "20", label: "₱20 지폐" },
    ];

    container.innerHTML = `
      <div class="pos-banner">
        <div>
          <h2>🔒 알바생 블라인드 마감 정산 — ${esc(branch.name)}</h2>
          <p>횡령 차단 원칙: 오늘 시스템 현금 매출과 남아야 할 용기/꼬치 개수는 직원 화면에 절대 표시되지 않습니다!</p>
        </div>
      </div>

      <div class="card" style="padding:20px;max-width:920px;margin:0 auto;">
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="field">
            <label>마감 지점</label>
            <input class="input" value="${esc(branch.name)}" disabled />
          </div>
          <div class="field">
            <label>마감 담당 직원 이름 (필수)</label>
            <input id="cls-staff" class="input" placeholder="예: Maria / 알바 김민수" />
          </div>
        </div>

        <h3 style="margin:12px 0 8px;">1단계. 현금통 & 시재 지폐 권종별 실제 장수</h3>
        <div class="form-grid" style="margin-bottom:12px;">
          ${denoms
            .map(
              (d) => `
            <div class="field">
              <label>${d.label}</label>
              <input type="number" min="0" value="0" class="input num cls-denom" data-denom="${d.key}" />
            </div>`
            )
            .join("")}
          <div class="field">
            <label>동전 합계 (Coins ₱)</label>
            <input type="number" min="0" value="0" class="input num cls-denom" data-denom="coins" />
          </div>
        </div>

        <div style="background:var(--surface-alt);padding:12px 16px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <strong>내가 센 현금 총액 (시재 포함)</strong>
          <strong id="cls-cash-sum" class="num" style="font-size:24px;color:var(--ink);">₱0</strong>
        </div>

        <h3 style="margin:12px 0 8px;">2단계. 선반에 남은 실물 용기 · 어묵 꼬치 · 음료 개수 (1:1 역산)</h3>
        <div class="table-wrap" style="margin-bottom:16px;">
          <table class="data-table">
            <thead>
              <tr><th>품목</th><th>남은 실물 수량 (꼭 정확히 세기)</th><th>조리 실수/폐기 수량 (선택)</th></tr>
            </thead>
            <tbody>
              ${invItems
                .map(
                  (it) => `
                <tr>
                  <td><strong>${esc(it.name_ko)}</strong> <small style="color:var(--ink-muted);">(${esc(it.name_en)})</small></td>
                  <td><input type="number" min="0" value="0" class="input num cls-rem" data-inv="${esc(it.id)}" style="max-width:130px;" /> ${esc(it.unit)}</td>
                  <td><input type="number" min="0" value="0" class="input num cls-waste" data-inv="${esc(it.id)}" style="max-width:110px;" /> ${esc(it.unit)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="field" style="margin-bottom:16px;">
          <label>특이사항 메모 (사장님 전달용)</label>
          <input id="cls-notes" class="input" placeholder="예: 50페소 잔돈 보충 필요, 오뎅 1개 떨어져서 폐기함" />
        </div>

        <button type="button" class="btn btn-primary btn-lg" style="width:100%;" id="btn-submit-closeout">
          🔒 블라인드 마감 보고 제출하기
        </button>
        <div id="cls-result" style="margin-top:12px;"></div>
      </div>
    `;

    const calcSum = () => {
      let sum = 0;
      container.querySelectorAll(".cls-denom").forEach((inp) => {
        const k = inp.dataset.denom;
        const v = Math.max(0, Number(inp.value || 0));
        sum += k === "coins" ? v : Number(k) * v;
      });
      document.getElementById("cls-cash-sum").textContent = php(sum);
    };
    container.querySelectorAll(".cls-denom").forEach((inp) => (inp.oninput = calcSum));

    document.getElementById("btn-submit-closeout").onclick = async () => {
      const staffName = document.getElementById("cls-staff").value.trim();
      if (!staffName) return toast("직원 이름을 입력해 주세요.", "error");
      const denominations = {};
      container.querySelectorAll(".cls-denom").forEach((i) => (denominations[i.dataset.denom] = Number(i.value || 0)));
      const remainingStock = {};
      container.querySelectorAll(".cls-rem").forEach((i) => (remainingStock[i.dataset.inv] = Number(i.value || 0)));
      const reportedWaste = {};
      container.querySelectorAll(".cls-waste").forEach((i) => (reportedWaste[i.dataset.inv] = Number(i.value || 0)));

      try {
        const res = await api("/api/closeouts", {
          method: "POST",
          body: {
            branchId: state.branchId,
            staffName,
            denominations,
            remainingStock,
            reportedWaste,
            notes: document.getElementById("cls-notes").value,
          },
        });
        document.getElementById("cls-result").innerHTML = `
          <div style="background:var(--green-soft);color:var(--green);padding:14px;border-radius:12px;font-weight:700;">
            ✅ ${esc(res.message)} (접수번호: ${esc(res.closeoutId)})<br>
            <small>보안 정책상 예상 차액은 사장님 폰 대시보드에만 표시됩니다.</small>
          </div>`;
        toast("블라인드 마감 제출 완료!", "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }

  // ---------- MODE 5: Owner Multi-Branch Command (PIN Protected) ----------
  async function loadAdminDashboard() {
    if (!state.adminPin) return;
    try {
      state.adminData = await api(
        `/api/admin/dashboard?date=${encodeURIComponent(state.adminDate)}&branchId=${encodeURIComponent(state.adminFilterBranch)}`
      );
    } catch (err) {
      if (err.status === 401) {
        state.adminPin = "";
        sessionStorage.removeItem("ksnack_pin");
        state.adminData = null;
      }
      toast(err.message, "error");
    }
  }

  function renderAdminMode(container) {
    if (!state.adminPin || !state.adminData) {
      container.innerHTML = `
        <div class="card" style="max-width:420px;margin:40px auto;padding:24px;text-align:center;">
          <span class="pill-tag tag-red">OWNER ONLY</span>
          <h2 style="margin:10px 0 6px;">📊 사장님 다지점 감시 로그인</h2>
          <p style="font-size:13px;color:var(--ink-muted);margin-bottom:16px;">초기 비밀번호는 <strong>7777</strong> 입니다. (로그인 후 변경 가능)</p>
          <input type="password" id="admin-pin-input" class="input num" style="text-align:center;font-size:24px;letter-spacing:8px;margin-bottom:12px;" placeholder="••••" value="" />
          <button type="button" class="btn btn-primary btn-lg" style="width:100%;" id="btn-admin-unlock">🔓 대시보드 잠금 해제</button>
        </div>
      `;
      const doUnlock = async () => {
        const pin = document.getElementById("admin-pin-input").value.trim();
        try {
          await api("/api/admin/verify-pin", { method: "POST", body: { pin } });
          state.adminPin = pin;
          sessionStorage.setItem("ksnack_pin", pin);
          await loadAdminDashboard();
          renderMain();
        } catch (err) {
          toast(err.message, "error");
        }
      };
      document.getElementById("btn-admin-unlock").onclick = doUnlock;
      document.getElementById("admin-pin-input").onkeydown = (e) => e.key === "Enter" && doUnlock();
      return;
    }

    const d = state.adminData;
    const vatPct = d.birTracker.percentOfThreshold;

    container.innerHTML = `
      <div class="pos-banner">
        <div>
          <h2>📊 사장님 다지점 통합 감시 & 횡령 적발 센터</h2>
          <p>모든 분점의 현금 오차 · 1:1 용기/꼬치 역산 · 취소 승인 · BIR ₱3M 한도를 한눈에 감시합니다.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="date" id="adm-date" class="input" style="width:auto;padding:6px 10px;" value="${esc(state.adminDate)}" />
          <select id="adm-branch-filter" class="input" style="width:auto;padding:6px 10px;">
            <option value="all" ${state.adminFilterBranch === "all" ? "selected" : ""}>전체 분점 통합</option>
            ${((state.bootstrap && state.bootstrap.branches) || []).map((b) => `<option value="${esc(b.id)}" ${state.adminFilterBranch === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
          </select>
          <a class="btn btn-ghost btn-sm" href="/api/admin/export-csv?date=${encodeURIComponent(state.adminDate)}&branchId=${encodeURIComponent(state.adminFilterBranch)}&pin=${encodeURIComponent(state.adminPin)}">📥 CSV</a>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-adm-lock">🔒 로그아웃</button>
        </div>
      </div>

      <div class="filter-bar">
        ${[
          ["overview", "📈 지점별 매출 & 횡령 적발"],
          ["dispatch", "📦 본사 물량 출고 (1:1 배급)"],
          ["menu", "🍔 메뉴 · 가격 · 사진"],
          ["branches", "🏪 분점 & 식권 관리"],
          ["settings", "⚙️ PayMongo · 텔레그램 · PIN"],
        ]
          .map(
            ([k, lbl]) =>
              `<button type="button" class="filter-chip ${state.adminTab === k ? "active" : ""}" data-adm-tab="${k}">${lbl}</button>`
          )
          .join("")}
      </div>

      <div id="admin-tab-body"></div>
    `;

    document.getElementById("adm-date").onchange = async (e) => {
      state.adminDate = e.target.value;
      await loadAdminDashboard();
      renderMain();
    };
    document.getElementById("adm-branch-filter").onchange = async (e) => {
      state.adminFilterBranch = e.target.value;
      await loadAdminDashboard();
      renderMain();
    };
    document.getElementById("btn-adm-lock").onclick = () => {
      state.adminPin = "";
      state.adminData = null;
      sessionStorage.removeItem("ksnack_pin");
      renderMain();
    };
    container.querySelectorAll("[data-adm-tab]").forEach((btn) => {
      btn.onclick = () => {
        state.adminTab = btn.dataset.admTab;
        renderAdminSubTab(document.getElementById("admin-tab-body"), d, vatPct);
        container.querySelectorAll("[data-adm-tab]").forEach((b) => b.classList.toggle("active", b.dataset.admTab === state.adminTab));
      };
    });

    renderAdminSubTab(document.getElementById("admin-tab-body"), d, vatPct);
  }

  function renderAdminSubTab(el, d, vatPct) {
    if (state.adminTab === "overview") {
      const pendingVoids = d.voidRequests.filter((v) => v.status === "pending");
      el.innerHTML = `
        <div class="kpi-grid">
          <div class="card kpi-card">
            <div class="kpi-label">총 매출 (${esc(d.businessDate)})</div>
            <div class="kpi-value num" style="color:var(--primary);">${php(d.totals.grossSales)}</div>
            <small class="num">주문 ${d.totals.paidOrderCount}건 (식권차감 ${php(d.totals.punchCardRedeemedValue)})</small>
          </div>
          <div class="card kpi-card">
            <div class="kpi-label">💵 현금 / 📱 GCash / 💳 카드</div>
            <div class="kpi-value num" style="font-size:17px;margin-top:8px;">
              ${php(d.totals.expectedCashSales)} / ${php(d.totals.expectedGcashSales)} / ${php(d.totals.cardOrderSales)}
            </div>
            <small>실시간 수단별 합산</small>
          </div>
          <div class="card kpi-card">
            <div class="kpi-label">🚨 오차·횡령 경보 지점</div>
            <div class="kpi-value num" style="color:${d.totals.flaggedBranches ? "var(--danger)" : "var(--green)"};">
              ${d.totals.flaggedBranches}곳
            </div>
            <small>미승인 취소 요청: ${pendingVoids.length}건</small>
          </div>
          <div class="card kpi-card">
            <div class="kpi-label">🇵🇭 BIR 300만 페소 VAT 한도 (다지점 합산)</div>
            <div class="kpi-value num" style="font-size:18px;">연 추정 ${php(d.birTracker.projectedAnnual)}</div>
            <div class="progress-track"><div class="progress-fill" style="width:${vatPct}%"></div></div>
            <small>한도 ₱3,000,000 대비 <strong>${vatPct}%</strong> ${vatPct >= 75 ? "⚠️ 3호점 전 세무사 상담 권장!" : "(Non-VAT 안전 구간)"}</small>
          </div>
        </div>

        ${
          pendingVoids.length > 0
            ? `<div class="card" style="padding:14px;margin-bottom:14px;border:2px solid var(--danger);background:var(--danger-soft);">
                 <h3 style="margin:0 0 8px;color:var(--danger);">🚨 승인 대기 중인 주문 취소(Void) 요청 (${pendingVoids.length}건)</h3>
                 ${pendingVoids
                   .map(
                     (v) => `
                   <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;padding:8px;background:#fff;border-radius:10px;margin-bottom:6px;">
                     <div>
                       <strong>[${esc(v.branch_name)}] 주문 #${v.order_number} · ${php(v.total_amount)}</strong>
                       <div style="font-size:12px;color:var(--ink-muted);">사유: ${esc(v.reason)} / 메모: ${esc(v.staff_note || "-")}</div>
                     </div>
                     <div style="display:flex;gap:6px;">
                       <button type="button" class="btn btn-primary btn-sm" data-resolve-void="${esc(v.id)}" data-dec="approve">✅ 취소 승인</button>
                       <button type="button" class="btn btn-ghost btn-sm" data-resolve-void="${esc(v.id)}" data-dec="reject">❌ 반려(매출유지)</button>
                     </div>
                   </div>`
                   )
                   .join("")}
               </div>`
            : ""
        }

        ${d.branchSummaries
          .map(
            (br) => `
          <div class="card" style="padding:16px;margin-bottom:14px;${br.alerts.flagged ? "border:2px solid var(--danger);" : ""}">
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
              <div>
                <h3 style="margin:0;">${esc(br.branch.name)}</h3>
                <small style="color:var(--ink-muted);">매출 ${php(br.metrics.grossSales)} (현금 ${php(br.metrics.expectedCashSales)} · GCash ${php(br.metrics.expectedGcashSales)} · 카드 ${php(br.metrics.cardOrderSales)}) · ₱500+ SI건: ${br.metrics.birSiOrdersCount}건</small>
              </div>
              <div>
                ${
                  br.latestCloseout
                    ? br.alerts.flagged
                      ? `<span class="pill-tag tag-red">🚨 오차 적발!</span>`
                      : `<span class="pill-tag tag-green">✅ 정산 완벽 일치</span>`
                    : `<span class="pill-tag tag-neutral">⏳ 마감 제출 대기</span>`
                }
              </div>
            </div>

            <div class="kpi-grid" style="margin-bottom:12px;">
              <div style="background:var(--surface-alt);padding:10px;border-radius:10px;">
                <div class="kpi-label">오픈 시재 (Float)</div>
                <strong class="num">${php(br.metrics.openingFloat)}</strong>
              </div>
              <div style="background:var(--surface-alt);padding:10px;border-radius:10px;">
                <div class="kpi-label">예상 서랍 현금 (시재+현금매출)</div>
                <strong class="num">${php(br.metrics.expectedDrawerCash)}</strong>
              </div>
              <div style="background:var(--surface-alt);padding:10px;border-radius:10px;">
                <div class="kpi-label">직원 블라인드 마감 현금</div>
                <strong class="num">${br.metrics.countedCashTotal !== null ? php(br.metrics.countedCashTotal) : "미제출"}</strong>
              </div>
              <div style="background:${br.alerts.hasCashDiscrepancy ? "var(--danger-soft)" : "var(--green-soft)"};padding:10px;border-radius:10px;">
                <div class="kpi-label">현금 과부족 (Over/Short)</div>
                <strong class="num" style="color:${br.alerts.hasCashDiscrepancy ? "var(--danger)" : "var(--green)"};">
                  ${br.metrics.cashOverShort === null ? "-" : br.metrics.cashOverShort === 0 ? "₱0 (일치)" : `${br.metrics.cashOverShort > 0 ? "+" : ""}${php(br.metrics.cashOverShort)}`}
                </strong>
              </div>
            </div>

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr><th>1:1 추적 품목</th><th>본사 출고</th><th>승인 폐기</th><th>시스템 판매</th><th>예상 잔여</th><th>마감 실물</th><th>오차 (Variance)</th></tr>
                </thead>
                <tbody>
                  ${br.inventoryAudit
                    .map(
                      (i) => `
                    <tr>
                      <td><strong>${esc(i.name_ko)}</strong></td>
                      <td class="num">${i.openingQty} ${esc(i.unit)}</td>
                      <td class="num">${i.approvedWasteQty}</td>
                      <td class="num">${i.soldQty}</td>
                      <td class="num"><strong>${i.expectedRemaining}</strong></td>
                      <td class="num">${i.reportedRemaining !== null ? i.reportedRemaining : "-"}</td>
                      <td class="num">
                        ${
                          i.variance === null
                            ? `<span class="pill-tag tag-neutral">대기</span>`
                            : i.variance === 0
                            ? `<span class="pill-tag tag-green">0 (일치)</span>`
                            : `<span class="pill-tag tag-red">🚨 ${i.variance > 0 ? `+${i.variance}` : i.variance} ${esc(i.unit)}</span>`
                        }
                      </td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>`
          )
          .join("")}

        <div class="card" style="padding:14px;">
          <h3 style="margin-top:0;">🛡️ 실시간 감사 로그 (Audit Trail)</h3>
          <div style="max-height:220px;overflow-y:auto;">
            ${d.auditLogs
              .map(
                (a) => `
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border);">
                <span><span class="pill-tag tag-neutral">${esc(a.branch_id)}</span> <strong>${esc(a.event_type)}</strong> · ${esc(a.summary)}</span>
                <span style="color:var(--ink-muted);">${new Date(a.created_at).toLocaleTimeString("en-PH")}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>
      `;

      el.querySelectorAll("[data-resolve-void]").forEach((b) => {
        b.onclick = async () => {
          try {
            await api(`/api/admin/void-requests/${b.dataset.resolveVoid}/resolve`, {
              method: "POST",
              body: { decision: b.dataset.dec },
            });
            await loadAdminDashboard();
            renderMain();
            toast("취소 요청 처리 완료!", "success");
          } catch (err) {
            toast(err.message, "error");
          }
        };
      });
    } else if (state.adminTab === "dispatch") {
      const targetBranchId = state.adminFilterBranch === "all" ? state.branchId : state.adminFilterBranch;
      const summary = d.branchSummaries.find((b) => b.branch.id === targetBranchId) || d.branchSummaries[0];
      el.innerHTML = `
        <div class="card" style="padding:18px;max-width:800px;">
          <h3 style="margin-top:0;">📦 센트럴 키친 일일 1:1 물량 출고 & 오픈 시재</h3>
          <p style="font-size:13px;color:var(--ink-muted);">매일 아침 지점별로 세어서 보내는 꼬치·용기 수량과 잔돈용 ₱50 다발 시재를 입력하세요.</p>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="field">
              <label>출고 대상 지점</label>
              <select id="disp-branch" class="input">
                ${((state.bootstrap && state.bootstrap.branches) || []).map((b) => `<option value="${esc(b.id)}" ${b.id === summary.branch.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>오픈 시재 (₱50×50장 = ₱2,500 권장)</label>
              <input type="number" id="disp-float" class="input num" value="${summary.metrics.openingFloat}" />
            </div>
          </div>
          <div class="table-wrap" style="margin-bottom:14px;">
            <table class="data-table">
              <thead><tr><th>품목</th><th>아침 출고량</th><th>사장님 승인 폐기량</th></tr></thead>
              <tbody>
                ${summary.inventoryAudit
                  .map(
                    (i) => `
                  <tr>
                    <td><strong>${esc(i.name_ko)}</strong></td>
                    <td><input type="number" class="input num disp-open" data-inv="${esc(i.inventoryItemId)}" value="${i.openingQty}" style="max-width:120px;" /></td>
                    <td><input type="number" class="input num disp-waste" data-inv="${esc(i.inventoryItemId)}" value="${i.approvedWasteQty}" style="max-width:120px;" /></td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-primary" id="btn-save-dispatch">💾 출고 수량 및 시재 저장</button>
        </div>
      `;
      document.getElementById("disp-branch").onchange = async (e) => {
        state.adminFilterBranch = e.target.value;
        await loadAdminDashboard();
        renderAdminSubTab(el, state.adminData, vatPct);
      };
      document.getElementById("btn-save-dispatch").onclick = async () => {
        const branchId = document.getElementById("disp-branch").value;
        const openingFloat = Number(document.getElementById("disp-float").value || 0);
        const allocations = [];
        el.querySelectorAll(".disp-open").forEach((inp) => {
          const id = inp.dataset.inv;
          const wasteInp = el.querySelector(`.disp-waste[data-inv="${id}"]`);
          allocations.push({
            inventoryItemId: id,
            openingQty: Number(inp.value || 0),
            approvedWasteQty: Number((wasteInp && wasteInp.value) || 0),
          });
        });
        try {
          await api("/api/admin/inventory/allocate", {
            method: "POST",
            body: { branchId, businessDate: state.adminDate, openingFloat, allocations },
          });
          await loadAdminDashboard();
          renderMain();
          toast("본사 물량 출고 저장 완료!", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      };
    } else if (state.adminTab === "menu") {
      const items = (state.bootstrap && state.bootstrap.menuItems) || [];
      el.innerHTML = `
        <div class="card" style="padding:16px;margin-bottom:14px;">
          <h3 style="margin-top:0;">➕ 새 메뉴 추가 (₱50 단위 가격 권장)</h3>
          <div class="form-grid" style="margin-bottom:10px;">
            <div class="field"><label>카테고리</label><select id="new-cat" class="input"><option value="combo">초고속 세트</option><option value="eomuk">오뎅</option><option value="cupbap">컵밥</option><option value="ramyun">라면</option><option value="tteokbokki">떡볶이</option><option value="drink">음료</option></select></div>
            <div class="field"><label>한국어 이름</label><input id="new-ko" class="input" placeholder="예: 치즈 컵밥 + 음료" /></div>
            <div class="field"><label>영어 이름</label><input id="new-en" class="input" placeholder="Cheese Cupbap + Drink" /></div>
            <div class="field"><label>가격 (₱)</label><input type="number" id="new-price" class="input num" value="150" step="10" /></div>
            <div class="field"><label>1:1 차감 용기</label><select id="new-inv" class="input">${((state.bootstrap && state.bootstrap.inventoryItems) || []).map((i) => `<option value="${esc(i.id)}">${esc(i.name_ko)}</option>`).join("")}</select></div>
            <div class="field"><label>원터치 세트 여부</label><select id="new-quick" class="input"><option value="1">⚡ 1-Tap 원터치 세트</option><option value="0">일반 메뉴</option></select></div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-menu">➕ 메뉴 추가하기</button>
        </div>

        <div class="card" style="padding:16px;">
          <h3 style="margin-top:0;">🍔 메뉴 가격 · 판매상태 · 실사 사진 관리</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>메뉴명</th><th>가격 (₱)</th><th>사진 교체 (폰 카메라/갤러리)</th><th>판매 상태</th><th>저장</th></tr></thead>
              <tbody>
                ${items
                  .map(
                    (m) => `
                  <tr>
                    <td><strong>${esc(m.name_ko)}</strong><br><small style="color:var(--ink-muted);">${esc(m.name_en)}</small></td>
                    <td><input type="number" class="input num" style="width:95px;" value="${m.price}" data-menu-price="${esc(m.id)}" /></td>
                    <td><input type="file" accept="image/*" class="input" style="max-width:210px;padding:6px;" data-menu-file="${esc(m.id)}" /></td>
                    <td>
                      <select class="input" style="width:105px;" data-menu-avail="${esc(m.id)}">
                        <option value="1" ${m.is_available ? "selected" : ""}>판매중</option>
                        <option value="0" ${!m.is_available ? "selected" : ""}>품절</option>
                      </select>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;">
                        <button type="button" class="btn btn-green btn-sm" data-menu-save="${esc(m.id)}">저장</button>
                        <button type="button" class="btn btn-danger-outline btn-sm" data-menu-del="${esc(m.id)}">삭제</button>
                      </div>
                    </td>
                  </tr>`
                  )
                  .join("") || `<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);">등록된 메뉴가 없습니다. 위에서 새 메뉴를 추가해 주세요!</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById("btn-add-menu").onclick = async () => {
        try {
          await api("/api/admin/menu", {
            method: "POST",
            body: {
              category: document.getElementById("new-cat").value,
              nameKo: document.getElementById("new-ko").value,
              nameEn: document.getElementById("new-en").value,
              price: Number(document.getElementById("new-price").value),
              isQuickCombo: document.getElementById("new-quick").value === "1",
              consumes: [{ inventory_item_id: document.getElementById("new-inv").value, qty: 1 }],
            },
          });
          await loadBootstrap();
          renderMain();
          toast("새 메뉴 추가 완료!", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      };

      const uploadedImages = {};
      el.querySelectorAll("[data-menu-file]").forEach((inp) => {
        inp.onchange = async () => {
          const file = (inp.files && inp.files[0]);
          if (!file) return;
          uploadedImages[inp.dataset.menuFile] = await compressImageToDataUrl(file, 480);
          toast("사진 준비 완료! [저장]을 눌러 반영하세요.", "info");
        };
      });

      el.querySelectorAll("[data-menu-save]").forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.dataset.menuSave;
          const m = items.find((x) => x.id === id);
          try {
            await api("/api/admin/menu", {
              method: "POST",
              body: {
                id,
                nameKo: m.name_ko,
                nameEn: m.name_en,
                price: Number(el.querySelector(`[data-menu-price="${id}"]`).value),
                isAvailable: el.querySelector(`[data-menu-avail="${id}"]`).value === "1",
                imageUrl: uploadedImages[id] || m.image_url,
              },
            });
            await loadBootstrap();
            renderMain();
            toast("메뉴 업데이트 완료!", "success");
          } catch (err) {
            toast(err.message, "error");
          }
        };
      });

      el.querySelectorAll("[data-menu-del]").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api(`/api/admin/menu/${encodeURIComponent(btn.dataset.menuDel)}`, { method: "DELETE" });
            await loadBootstrap();
            renderMain();
            toast("메뉴가 삭제되었습니다.", "success");
          } catch (err) {
            toast(err.message, "error");
          }
        };
      });
    } else if (state.adminTab === "branches") {
      el.innerHTML = `
        <div class="card" style="padding:16px;margin-bottom:14px;">
          <h3 style="margin-top:0;">🏪 분점 추가 / 운영 형태 설정</h3>
          <div class="form-grid" style="margin-bottom:10px;">
            <div class="field"><label>분점 ID (영문)</label><input id="br-id" class="input" placeholder="예: school-c" /></div>
            <div class="field"><label>지점 이름</label><input id="br-name" class="input" placeholder="예: 4호점 · C고등학교 앞" /></div>
            <div class="field"><label>기본 모드</label><select id="br-mode" class="input"><option value="pos">🏫 학교 부스 (직원 2-Tap POS)</option><option value="kiosk">🏪 로드샵 (손님 키오스크)</option></select></div>
            <div class="field"><label>오픈 시재 (₱)</label><input type="number" id="br-float" class="input num" value="2500" /></div>
            <div class="field"><label>지점 GCash 번호</label><input id="br-gcash" class="input" placeholder="0917-xxx-xxxx" /></div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-save-branch">💾 분점 저장/추가</button>
        </div>

        <div class="card" style="padding:16px;">
          <h3 style="margin-top:0;">등록된 분점 목록</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>지점 ID</th><th>지점명</th><th>기본 모드</th><th>오픈 시재</th><th>바로 이동</th></tr></thead>
              <tbody>
                ${((state.bootstrap && state.bootstrap.branches) || [])
                  .map(
                    (b) => `
                  <tr>
                    <td><code>${esc(b.id)}</code></td>
                    <td><strong>${esc(b.name)}</strong></td>
                    <td>${b.default_mode === "pos" ? "⚡ 직원 POS" : "📱 손님 키오스크"}</td>
                    <td class="num">${php(b.opening_float || 2500)}</td>
                    <td>
                      <button type="button" class="btn btn-ghost btn-sm" data-jump-branch="${esc(b.id)}" data-jump-mode="${esc(b.default_mode)}">열기</button>
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
      document.getElementById("btn-save-branch").onclick = async () => {
        try {
          const modeVal = document.getElementById("br-mode").value;
          await api("/api/admin/branches", {
            method: "POST",
            body: {
              id: document.getElementById("br-id").value.trim(),
              name: document.getElementById("br-name").value.trim(),
              type: modeVal === "pos" ? "school_stall" : "shop_kiosk",
              defaultMode: modeVal,
              openingFloat: Number(document.getElementById("br-float").value || 2500),
              gcashNumber: document.getElementById("br-gcash").value.trim(),
            },
          });
          await loadBootstrap();
          await loadAdminDashboard();
          renderMain();
          toast("분점 저장 완료!", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      };
      el.querySelectorAll("[data-jump-branch]").forEach((b) => {
        b.onclick = async () => {
          state.branchId = b.dataset.jumpBranch;
          localStorage.setItem("ksnack_branch", state.branchId);
          await switchMode(b.dataset.jumpMode);
        };
      });
    } else if (state.adminTab === "settings") {
      const s = d.settings;
      el.innerHTML = `
        <div class="card" style="padding:18px;max-width:860px;">
          <h3 style="margin-top:0;">⚙️ 결제(PayMongo) · 텔레그램 알림 · BIR · PIN 설정</h3>

          <div style="background:var(--gold-soft);border:1px solid #ebc28b;padding:12px;border-radius:10px;font-size:12px;margin-bottom:14px;">
            💡 <strong>필리핀 PG사 수수료 주의:</strong><br>
            • <strong>PayMongo (추천):</strong> Dynamic QR Ph 1.34% (+VAT), <strong>최소 수수료 없음</strong> (₱150 컵밥 수수료 약 ₱2)<br>
            • <strong>HitPay:</strong> QR Ph 1% 또는 <strong>최소 ₱20</strong> 중 큰 금액 (₱150 컵밥 팔면 ₱20 빠져 손해! HitPay는 카드 단말기용으로만 권장)
          </div>

          <div class="form-grid" style="margin-bottom:14px;">
            <div class="field"><label>매장 상호명</label><input id="set-shop" class="input" value="${esc(s.shopName)}" /></div>
            <div class="field"><label>사업자 TIN (BIR VAT 추적용)</label><input id="set-tin" class="input" value="${esc(s.birTin)}" /></div>
            <div class="field">
              <label>GCash / QR Ph 결제 방식</label>
              <select id="set-pm-mode" class="input">
                <option value="manual_qr" ${s.paymongoMode === "manual_qr" ? "selected" : ""}>고정 사업자 QR + 사운드박스</option>
                <option value="paymongo_dynamic" ${s.paymongoMode === "paymongo_dynamic" ? "selected" : ""}>PayMongo Dynamic QR Ph (자동입금 웹훅)</option>
              </select>
            </div>
            <div class="field"><label>PayMongo Secret Key (${esc(s.paymongoSecretKeyMasked || "미설정")})</label><input id="set-pm-sk" class="input" placeholder="sk_live_... 또는 sk_test_..." /></div>
            <div class="field"><label>PayMongo Webhook Secret (${esc(s.paymongoWebhookSecretMasked || "미설정")})</label><input id="set-pm-wh" class="input" placeholder="whsec_..." /></div>
            <div class="field"><label>텔레그램 Bot Token</label><input id="set-tg-tok" class="input" placeholder="123456:ABC..." /></div>
            <div class="field"><label>텔레그램 Chat ID</label><input id="set-tg-chat" class="input" value="${esc(s.telegramChatId)}" placeholder="-100..." /></div>
            <div class="field"><label>안내문 GCash 상호명</label><input id="set-gc-name" class="input" value="${esc(s.signageGcashName)}" /></div>
            <div class="field"><label>안내문 GCash 번호</label><input id="set-gc-num" class="input" value="${esc(s.signageGcashNumber)}" /></div>
            <div class="field"><label>새 사장님 PIN (숫자 4~8자리)</label><input type="password" id="set-pin" class="input" placeholder="변경 시에만 입력" /></div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
            <button type="button" class="btn btn-primary" id="btn-save-settings">💾 모든 설정 저장</button>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:14px;">
            <strong style="display:block;margin-bottom:8px;">데이터 관리 (매일 자정 필리핀 시간 기준 자동 일자 분리 / 수동 초기화)</strong>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-danger-outline btn-sm" id="btn-reset-clean">🧹 주문·매출·마감 기록만 초기화</button>
              <button type="button" class="btn btn-ghost btn-sm" id="btn-reset-all">🗑️ 메뉴까지 모두 비우기</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById("btn-save-settings").onclick = async () => {
        try {
          const newPin = document.getElementById("set-pin").value.trim();
          await api("/api/admin/settings", {
            method: "POST",
            body: {
              shopName: document.getElementById("set-shop").value,
              birTin: document.getElementById("set-tin").value,
              paymongoMode: document.getElementById("set-pm-mode").value,
              paymongoSecretKey: document.getElementById("set-pm-sk").value.trim() || undefined,
              paymongoWebhookSecret: document.getElementById("set-pm-wh").value.trim() || undefined,
              telegramBotToken: document.getElementById("set-tg-tok").value.trim() || undefined,
              telegramChatId: document.getElementById("set-tg-chat").value.trim(),
              signageGcashName: document.getElementById("set-gc-name").value,
              signageGcashNumber: document.getElementById("set-gc-num").value,
              newPin: newPin || undefined,
            },
          });
          if (newPin) {
            state.adminPin = newPin;
            sessionStorage.setItem("ksnack_pin", newPin);
          }
          await loadBootstrap();
          await loadAdminDashboard();
          renderMain();
          toast("설정이 저장되었습니다!", "success");
        } catch (err) {
          toast(err.message, "error");
        }
      };

      document.getElementById("btn-reset-clean").onclick = async () => {
        await api("/api/admin/demo-reset", { method: "POST", body: { wipeMenus: false } });
        await loadAdminDashboard();
        renderMain();
        toast("매출·주문·마감 기록이 초기화되었습니다!", "success");
      };
      document.getElementById("btn-reset-all").onclick = async () => {
        await api("/api/admin/demo-reset", { method: "POST", body: { wipeMenus: true } });
        await loadBootstrap();
        await loadAdminDashboard();
        renderMain();
        toast("메뉴와 모든 기록이 초기화되었습니다!", "success");
      };
    }
  }

  // ---------- MODE 6: Printable BSP-Compliant Cash Drop-Box & QR Signage Studio ----------
  function renderSignageMode(container) {
    const branch = getActiveBranch();
    const shopName = (state.bootstrap && state.bootstrap.shopName) || "HM Snacks";
    const baseOrigin = window.location.origin;
    const lineQrUrl = `${baseOrigin}/?mode=kiosk&branchId=${encodeURIComponent(branch.id)}&table=LINE-QR&lock=1`;
    const table1QrUrl = `${baseOrigin}/?mode=kiosk&branchId=${encodeURIComponent(branch.id)}&table=Table-1&lock=1`;

    const makePostersHtml = () => `
      <div class="signage-grid signage-print-sheet">
        <!-- Poster 1: BSP-Compliant Unfold Bills Flat -->
        <article class="sign-poster accent-green">
          <div>
            <div class="sign-header-band">💵 CASH PAYMENT · 투명 돈통 안내</div>
            <h3 style="margin:0 0 8px;font-size:21px;text-align:center;">Please UNFOLD Bills Flat!</h3>
            <p style="font-size:15px;font-weight:700;text-align:center;color:var(--green);margin:0 0 12px;">
              Folded bills ARE accepted — please just open them flat for fast checking!
            </p>
            <div style="background:var(--surface-warm);border:2px dashed var(--gold);border-radius:12px;padding:12px;margin-bottom:12px;">
              <strong style="display:block;font-size:15px;margin-bottom:4px;">🇵🇭 Taglish (학생 협조용)</strong>
              <p style="margin:0;font-size:14px;font-weight:700;">
                “Paki-unfold / flat po ang pera bago ipakita sa staff at ilagay sa box. Salamat!”
              </p>
            </div>
          </div>
          <div style="font-size:11px;color:var(--ink-muted);border-top:1px solid var(--border);padding-top:8px;">
            • Note: Severely torn or mutilated bills cannot be accepted (BSP rule compliant).<br>
            • ${esc(shopName)} — ${esc(branch.name)}
          </div>
        </article>

        <!-- Poster 2: Hygiene 3-Step Drop Box -->
        <article class="sign-poster">
          <div>
            <div class="sign-header-band">🍢 CLEAN HANDS, FAST SERVING!</div>
            <ol style="font-size:15px;font-weight:700;padding-left:20px;line-height:1.8;margin:0 0 12px;">
              <li>Unfold cash flat &amp; show clearly to staff.<br><small style="font-weight:500;color:var(--ink-muted);">지폐를 펴서 직원 눈앞에 보여주세요.</small></li>
              <li>Drop into the transparent cash box.<br><small style="font-weight:500;color:var(--ink-muted);">확인 후 투명 돈통에 직접 넣어주세요.</small></li>
              <li>Exact ₱50/₱100 amount or GCash appreciated!<br><small style="font-weight:500;color:var(--ink-muted);">잔돈 없는 딱 맞는 금액·GCash 환영!</small></li>
            </ol>
          </div>
          <div style="background:var(--blue-soft);color:var(--blue);padding:10px;border-radius:10px;text-align:center;font-weight:800;font-size:14px;">
            📱 GCash: ${esc(branch.gcash_number || (state.bootstrap && state.bootstrap.signageGcashNumber) || "")} (${esc((state.bootstrap && state.bootstrap.signageGcashName) || "")})
          </div>
        </article>

        <!-- Poster 3: Anti-Theft Order Slip Free Meal Sticker -->
        <article class="sign-poster accent-red">
          <div>
            <div class="sign-header-band">🚨 OFFICIAL STORE POLICY</div>
            <div style="text-align:center;padding:12px 6px;">
              <div style="font-size:24px;font-weight:900;color:var(--primary);line-height:1.25;margin-bottom:10px;">
                IF YOU DON'T RECEIVE AN ORDER NUMBER / SLIP,<br>YOUR MEAL IS FREE!
              </div>
              <p style="font-size:14px;font-weight:700;margin:0 0 10px;">
                “Kapag walang Order Number o Slip, LIBRE ang pagkain mo!”
              </p>
              <p style="font-size:12px;color:var(--ink-muted);margin:0;">
                Always ask for your Order Number (#101~) after paying. (Internal Order Slip only — Not an Official BIR Sales Invoice)
              </p>
            </div>
          </div>
          <div style="text-align:center;font-size:12px;font-weight:800;border-top:1px solid var(--border);padding-top:8px;">
            ${esc(shopName)} · Anti-Unrecorded Sales Guarantee
          </div>
        </article>

        <!-- Poster 4: Skip the Line + Table QR Self-Order -->
        <article class="sign-poster">
          <div>
            <div class="sign-header-band">📱 SKIP THE LINE! SCAN TO ORDER</div>
            <div style="display:flex;align-items:center;justify-content:space-around;gap:12px;text-align:center;padding:8px 0;">
              <div>
                ${KSnackQR.generateQrSvg(lineQrUrl, 130)}
                <div style="font-size:12px;font-weight:800;margin-top:4px;">줄 맨 뒤 사전주문 QR</div>
                <small style="font-size:10px;color:var(--ink-muted);">LINE-QR (${esc(branch.id)})</small>
              </div>
              <div>
                ${KSnackQR.generateQrSvg(table1QrUrl, 130)}
                <div style="font-size:12px;font-weight:800;margin-top:4px;">테이블 오더 QR (T1)</div>
                <small style="font-size:10px;color:var(--ink-muted);">Table-1 (${esc(branch.id)})</small>
              </div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--ink-muted);text-align:center;border-top:1px solid var(--border);padding-top:8px;">
            폰 카메라로 스캔하면 별도 태블릿 없이 바로 주문번호가 발급됩니다!
          </div>
        </article>
      </div>
    `;

    container.innerHTML = `
      <div class="pos-banner">
        <div>
          <h2>🖨️ 돈통 · 카운터 · QR 안내문 인쇄 스튜디오</h2>
          <p>필리핀 중앙은행(BSP) 규정 준수 "구겨진 돈 펴서 넣기" 영문·따갈로그 안내문 + 횡령 방지 스티커 + 사전주문 QR</p>
        </div>
        <button type="button" class="btn btn-primary" id="btn-print-signage">🖨️ A4 안내문 4종 인쇄하기</button>
      </div>
      ${makePostersHtml()}
    `;

    document.getElementById("btn-print-signage").onclick = () => {
      document.getElementById("print-area").innerHTML = makePostersHtml();
      window.print();
    };
  }

  // ---------- Image Compressor (Phone Photo -> Small Data URL) ----------
  function compressImageToDataUrl(file, maxSize = 480) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Main Render Dispatcher ----------
  function renderMain() {
    const main = document.getElementById("app-main");
    if (!state.bootstrap) return;
    if (state.mode === "pos") renderPosMode(main);
    else if (state.mode === "kiosk") renderKioskMode(main);
    else if (state.mode === "kitchen") renderKitchenMode(main);
    else if (state.mode === "closeout") renderCloseoutMode(main);
    else if (state.mode === "admin") renderAdminMode(main);
    else if (state.mode === "signage") renderSignageMode(main);
  }

  // ---------- Global Event Bindings ----------
  document.getElementById("branch-select").onchange = async (e) => {
    state.branchId = e.target.value;
    localStorage.setItem("ksnack_branch", state.branchId);
    const branch = getActiveBranch();
    if (!urlParams.get("mode") && (branch && branch.default_mode) && ["pos", "kiosk"].includes(state.mode)) {
      state.mode = branch.default_mode;
    }
    updateUrlParams();
    renderHeader();
    await loadOrders();
    if (state.mode === "pos") await loadPunchCards();
    renderMain();
  };

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.onclick = () => switchMode(tab.dataset.mode);
  });

  document.getElementById("btn-kiosk-lock").onclick = () => {
    state.kioskLocked = true;
    localStorage.setItem("ksnack_locked", "1");
    updateUrlParams();
    renderHeader();
    toast("키오스크 화면이 잠겼습니다. (사장님 PIN으로 해제)", "info");
  };

  document.getElementById("btn-kiosk-unlock").onclick = () => {
    openModal(`
      <h3 style="margin-top:0;">🔓 키오스크 화면 잠금 해제</h3>
      <p style="font-size:13px;color:var(--ink-muted);">사장님 PIN 번호(초기값: 7777)를 입력하세요.</p>
      <input type="password" id="unlock-pin" class="input num" style="text-align:center;font-size:22px;margin-bottom:12px;" placeholder="••••" />
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-ghost" style="flex:1;" onclick="window.__closeModal()">취소</button>
        <button type="button" class="btn btn-primary" style="flex:2;" id="btn-do-unlock">잠금 해제</button>
      </div>
    `);
    document.getElementById("btn-do-unlock").onclick = async () => {
      const pin = document.getElementById("unlock-pin").value.trim();
      try {
        await api("/api/admin/verify-pin", { method: "POST", body: { pin } });
        state.kioskLocked = false;
        localStorage.removeItem("ksnack_locked");
        closeModal();
        updateUrlParams();
        renderHeader();
        toast("화면 잠금이 해제되었습니다.", "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  };

  // ---------- Init ----------
  (async function init() {
    await loadBootstrap();
    await loadOrders();
    if (state.mode === "pos") await loadPunchCards();
    if (state.mode === "admin" && state.adminPin) await loadAdminDashboard();
    connectSSE();
    renderHeader();
    renderMain();
  })();
})();
