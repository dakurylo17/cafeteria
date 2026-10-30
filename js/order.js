// Mandje, afrekenen, afhaaltijd, accounts en bestelstatus op de website
const Cart = (() => {
  const { t, fmtTime, fmtPrice, escapeHtml, slug } = Shop;
  const $ = (sel, root = document) => root.querySelector(sel);
  const CUSTOMER_KEY = "zeeheld-customer";

  // Alle menu-items op id (slug van de naam)
  const ITEMS = {};
  MENU.forEach((cat) => cat.items.forEach(([name, price]) => {
    ITEMS[slug(name)] = { id: slug(name), name, price };
  }));

  /* ---------- Mandje ---------- */
  let cart = Shop.read(Shop.KEY.cart, {});
  Object.keys(cart).forEach((id) => { if (!ITEMS[id] || cart[id] <= 0) delete cart[id]; });

  function save() {
    Shop.write(Shop.KEY.cart, cart);
    renderCart();
    document.dispatchEvent(new Event("cartchange"));
  }
  const qty = (id) => cart[id] || 0;
  function add(id, n = 1) {
    if (!ITEMS[id]) return;
    cart[id] = qty(id) + n;
    if (cart[id] <= 0) delete cart[id];
    save();
  }
  function clear() {
    cart = {};
    save();
  }
  const lines = () => Object.entries(cart).map(([id, q]) => ({ ...ITEMS[id], qty: q }));
  const count = () => lines().reduce((sum, l) => sum + l.qty, 0);

  /* ---------- Lagen: lade en vensters ---------- */
  const overlay = $("#overlay");
  const drawer = $("#cart");
  const accountModal = $("#account-modal");
  const orderModal = $("#order-modal");
  let openEl = null;
  let lastFocus = null;

  function openLayer(el) {
    if (openEl === el) return;
    closeLayer(false);
    lastFocus = lastFocus || document.activeElement;
    el.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      el.classList.add("is-open");
      overlay.classList.add("is-open");
    });
    document.body.classList.add("no-scroll");
    openEl = el;
    const closeBtn = el.querySelector("[data-close]");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }
  function closeLayer(restoreFocus = true) {
    if (!openEl) return;
    const el = openEl;
    openEl = null;
    el.classList.remove("is-open");
    overlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
      if (!el.classList.contains("is-open")) el.hidden = true;
      if (!openEl) overlay.hidden = true;
    }, 260);
    if (restoreFocus && lastFocus && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
      lastFocus = null;
    }
  }

  overlay.addEventListener("click", () => closeLayer());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLayer(); });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeLayer();
    if (e.target.closest("[data-open-cart]")) return openCart();
    const acc = e.target.closest("[data-open-account]");
    if (acc) return openAccount(acc.dataset.openAccount || undefined);
    const ord = e.target.closest("[data-order]");
    if (ord) return showOrder(ord.dataset.order);
  });

  /* ---------- Melding ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-open"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("is-open");
      setTimeout(() => { el.hidden = true; }, 300);
    }, 3500);
  }

  /* ---------- Lade: mandje + afrekenen ---------- */
  const form = $("#checkout");
  const field = (name) => form.elements.namedItem(name);

  function totalsHtml(q, member) {
    return `
      <div class="totals__row"><span>${t("cart.subtotal")}</span><span>${fmtPrice(q.subtotal)}</span></div>
      ${member ? `<div class="totals__row totals__row--discount"><span>⭐ ${t("cart.discount")}</span><span>− ${fmtPrice(q.discount)}</span></div>` : ""}
      <div class="totals__row totals__row--total"><span>${t("cart.total")}</span><span>${fmtPrice(q.total)}</span></div>`;
  }

  function renderCart() {
    const ls = lines();
    const n = count();
    const user = Shop.currentUser();
    const q = Shop.quote(ls, !!user);

    const countEl = $("#cart-count");
    countEl.textContent = n;
    countEl.hidden = !n;
    const bar = $("#cart-bar");
    bar.hidden = !n;
    bar.innerHTML = `<span class="cart-bar__count">${n}</span><span>${t("cart.view")}</span><strong>${fmtPrice(q.total)}</strong>`;
    document.body.classList.toggle("has-cart", n > 0);

    $("#cart-empty").hidden = n > 0;
    form.hidden = !n;
    $("#cart-items").innerHTML = ls.map((l) => `<li class="cart-item">
      <div class="cart-item__info"><strong>${escapeHtml(l.name)}</strong><small>${fmtPrice(l.price)}</small></div>
      <div class="qty">
        <button type="button" data-dec="${l.id}" aria-label="${escapeHtml(t("cart.remove"))}">−</button>
        <span>${l.qty}</span>
        <button type="button" data-inc="${l.id}" aria-label="${escapeHtml(t("menu.add"))}">+</button>
      </div>
      <strong class="cart-item__total">${fmtPrice(l.price * l.qty)}</strong>
    </li>`).join("");

    const savings = Shop.round2(q.subtotal * Shop.DISCOUNT);
    $("#totals").innerHTML = totalsHtml(q, !!user) + (user ? "" : `
      <div class="save-hint">
        <span>🎁 ${t("cart.saveHint", fmtPrice(savings))}</span>
        <button type="button" class="link-btn" data-open-account="register">${t("cart.saveBtn")}</button>
      </div>`);
    $("#place-btn").textContent = t("cart.place", fmtPrice(q.total));
    if (n) renderPickup();
  }

  $("#cart-items").addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]");
    const dec = e.target.closest("[data-dec]");
    if (inc) add(inc.dataset.inc, 1);
    if (dec) add(dec.dataset.dec, -1);
  });

  function renderPickup() {
    const box = $("#pickup");
    const prevWhen = (box.querySelector("input[name=when]:checked") || {}).value || "asap";
    const prevSlot = (box.querySelector("select") || {}).value;
    const plan = Shop.pickupPlan(Math.max(1, count()));
    if (!plan) {
      box.innerHTML = `<p class="notice">${t("err.closed")}</p>`;
      return;
    }
    const when = Shop.whenText(plan.date, plan.earliest);
    const prefix = plan.date === Shop.now().date ? "" : Shop.dayLabel(plan.date) + " ";
    const later = prevWhen === "later" && plan.slots.length > 0;
    box.innerHTML = `
      ${plan.openNow ? "" : `<p class="notice">🌙 ${t("cart.closed", when)}</p>`}
      <label class="radio">
        <input type="radio" name="when" value="asap" ${later ? "" : "checked"}>
        <span><strong>${t("cart.asap", when)}</strong></span>
      </label>
      ${plan.slots.length ? `
        <div class="radio">
          <label class="radio__label"><input type="radio" name="when" value="later" ${later ? "checked" : ""}> <span>${t("cart.later")}</span></label>
          <select name="slot" aria-label="${escapeHtml(t("cart.later"))}">
            ${plan.slots.map((s) => `<option value="${s}" ${String(s) === prevSlot ? "selected" : ""}>${prefix}${fmtTime(s)}</option>`).join("")}
          </select>
        </div>` : ""}
      <p class="hint">⏱ ${t("cart.prep", plan.prep)}</p>`;
  }

  $("#pickup").addEventListener("change", (e) => {
    if (e.target.name === "slot") $("#pickup input[value=later]").checked = true;
  });
  $("#pickup").addEventListener("focusin", (e) => {
    if (e.target.name === "slot") $("#pickup input[value=later]").checked = true;
  });

  function prefillCustomer() {
    const user = Shop.currentUser();
    const saved = Shop.read(CUSTOMER_KEY, {});
    if (!field("cname").value) field("cname").value = (user && user.name) || saved.name || "";
    if (!field("cphone").value) field("cphone").value = (user && user.phone) || saved.phone || "";
  }

  function openCart() {
    renderCart();
    prefillCustomer();
    openLayer(drawer);
  }

  function showFormError(el, key) {
    el.textContent = key ? t("err." + key) : "";
    el.hidden = !key;
  }
  const validPhone = (p) => p.replace(/\D/g, "").length >= 9;
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const errEl = $("#checkout-error");
    const ls = lines();
    const name = field("cname").value.trim();
    const phone = field("cphone").value.trim();
    const note = field("cnote").value.trim();
    if (!ls.length) return showFormError(errEl, "required");
    if (!name || !phone) return showFormError(errEl, "required");
    if (!validPhone(phone)) return showFormError(errEl, "phone");

    // Opnieuw berekenen: de tijd kan verstreken zijn sinds de lade openging
    const plan = Shop.pickupPlan(count());
    if (!plan) return showFormError(errEl, "closed");
    const later = (form.querySelector("input[name=when]:checked") || {}).value === "later";
    const slot = Number((form.querySelector("select[name=slot]") || {}).value);
    const time = later && slot >= plan.earliest ? slot : plan.earliest;

    let order;
    try {
      order = Shop.placeOrder({
        items: ls.map(({ id, name: n, price, qty: q }) => ({ id, name: n, price, qty: q })),
        customer: { name, phone },
        pickup: { date: plan.date, time, asap: !later },
        note,
      });
    } catch (err) {
      return showFormError(errEl, "storage");
    }
    showFormError(errEl, null);
    Shop.write(CUSTOMER_KEY, { name, phone });
    field("cnote").value = "";
    $("#pickup").innerHTML = "";
    clear();
    showOrder(order.id, true);
  });

  /* ---------- Bestelstatus ---------- */
  let shownOrderId = null;
  let justPlaced = false;
  const STEPS = ["new", "preparing", "ready", "done"];

  function showOrder(id, placed = false) {
    shownOrderId = id;
    justPlaced = placed;
    renderOrder();
    openLayer(orderModal);
  }

  function renderOrder() {
    const o = shownOrderId && Shop.getOrder(shownOrderId);
    if (!o) return;
    const isToday = o.pickup.date === Shop.now().date;
    const step = STEPS.indexOf(o.status);
    const cancelled = o.status === "cancelled";
    const message = o.status === "ready" ? t("order.readyMsg") : cancelled ? t("order.cancelledMsg") : "";

    $("#order-content").innerHTML = `
      ${justPlaced ? `<p class="eyebrow">✅ ${t("order.thanks")}</p>` : ""}
      <h2>${t("order.number", o.number)}</h2>
      <div class="ready-time ready-time--${o.status}">
        <small>${isToday ? t("order.readyAt") : t("order.readyDay", Shop.dayLabel(o.pickup.date))}</small>
        <strong>${fmtTime(o.pickup.time)}</strong>
        ${o.timeChanged ? `<span class="ready-time__changed">${t("order.changed")}</span>` : ""}
      </div>
      ${message ? `<p class="order-msg order-msg--${o.status}">${message}</p>` : ""}
      ${cancelled ? "" : `<ol class="steps">
        ${STEPS.slice(0, 3).map((s, i) => `<li class="${step >= i ? "is-done" : ""} ${step === i ? "is-current" : ""}">${t("order.status." + s)}</li>`).join("")}
      </ol>`}
      <ul class="order-lines">
        ${o.items.map((i) => `<li><span>${i.qty}×</span><span>${escapeHtml(i.name)}</span><span>${fmtPrice(i.price * i.qty)}</span></li>`).join("")}
      </ul>
      ${o.note ? `<p class="order-note">💬 ${escapeHtml(o.note)}</p>` : ""}
      <div class="totals">${totalsHtml(o, o.member)}</div>
      <p class="fineprint">💳 ${t("order.payAtPickup")} · 📍 ${t("order.where")}</p>
      <button type="button" class="btn btn--primary btn--block" data-close>${t("order.again")}</button>`;
  }

  function renderStrip() {
    const strip = $("#order-strip");
    const o = Shop.activeOrder();
    strip.hidden = !o;
    if (!o) return;
    strip.dataset.order = o.id;
    strip.classList.toggle("is-ready", o.status === "ready");
    strip.innerHTML = o.status === "ready"
      ? `<span>${t("order.stripReady", o.number)}</span><span class="order-strip__cta">${t("order.view")} →</span>`
      : `<span>🍟 ${t("order.strip", o.number, Shop.whenText(o.pickup.date, o.pickup.time))}</span><span class="order-strip__cta">${t("order.view")} →</span>`;
  }

  /* ---------- Account ---------- */
  let accountTab = "register";

  function openAccount(tab) {
    if (tab) accountTab = tab;
    renderAccount();
    openLayer(accountModal);
  }

  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  function renderAccount() {
    const box = $("#account-content");
    const user = Shop.currentUser();
    if (user) {
      const list = Shop.myOrders().slice(0, 10);
      box.innerHTML = `
        <div class="profile">
          <span class="avatar avatar--lg">${escapeHtml(initials(user.name))}</span>
          <div>
            <h2>${t("acc.hello", escapeHtml(user.name.split(" ")[0]))}</h2>
            <p class="member-badge">⭐ ${t("acc.member")}</p>
          </div>
        </div>
        <h3 class="sub-title">${t("acc.myOrders")}</h3>
        ${list.length ? `<ul class="my-orders">${list.map((o) => `<li>
            <button type="button" data-order="${o.id}">
              <span><strong>#${o.number}</strong> · ${Shop.dayLabel(o.pickup.date)} ${fmtTime(o.pickup.time)}</span>
              <span class="pill pill--${o.status}">${t("order.status." + o.status)}</span>
              <span class="my-orders__total">${fmtPrice(o.total)}</span>
            </button></li>`).join("")}</ul>`
          : `<p class="muted">${t("acc.noOrders")}</p>`}
        <button type="button" class="btn btn--outline btn--block" id="logout-btn">${t("acc.logout")}</button>`;
      $("#logout-btn").addEventListener("click", () => {
        Shop.logout();
        closeLayer();
      });
      return;
    }

    const reg = accountTab === "register";
    box.innerHTML = `
      <div class="tabs" role="tablist">
        <button type="button" role="tab" class="tab ${reg ? "is-active" : ""}" aria-selected="${reg}" data-tab="register">${t("acc.register")}</button>
        <button type="button" role="tab" class="tab ${reg ? "" : "is-active"}" aria-selected="${!reg}" data-tab="login">${t("acc.login")}</button>
      </div>
      <p class="perk">🎁 ${t("acc.perk")}</p>
      <form class="account-form" id="account-form" novalidate>
        ${reg ? `
          <label class="field"><span>${t("acc.name")}</span><input name="name" autocomplete="name" required></label>
          <label class="field"><span>${t("acc.phone")}</span><input name="phone" type="tel" autocomplete="tel" required></label>` : ""}
        <label class="field"><span>${t("acc.email")}</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>${t("acc.password")}</span>
          <input name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="6" required>
          ${reg ? `<small>${t("acc.passwordHint")}</small>` : ""}
        </label>
        <p class="form-error" id="account-error" hidden></p>
        <button type="submit" class="btn btn--primary btn--block">${reg ? t("acc.registerBtn") : t("acc.loginBtn")}</button>
      </form>`;

    box.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      accountTab = b.dataset.tab;
      renderAccount();
      const first = box.querySelector("input");
      if (first) first.focus();
    }));

    const f = $("#account-form");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = $("#account-error");
      const v = (n) => (f.elements.namedItem(n) ? f.elements.namedItem(n).value.trim() : "");
      const data = { name: v("name"), phone: v("phone"), email: v("email"), password: f.elements.namedItem("password").value };
      if ((reg && (!data.name || !data.phone)) || !data.email || !data.password) return showFormError(errEl, "required");
      if (!validEmail(data.email)) return showFormError(errEl, "email");
      if (reg && !validPhone(data.phone)) return showFormError(errEl, "phone");
      if (reg && data.password.length < 6) return showFormError(errEl, "password");
      try {
        const user = reg ? await Shop.register(data) : await Shop.login(data.email, data.password);
        toast(t("acc.welcome", user.name.split(" ")[0]));
        if (count()) openCart();
        else closeLayer();
      } catch (err) {
        showFormError(errEl, err.message);
      }
    });
  }

  /* ---------- Header, promo ---------- */
  function renderHeader() {
    const user = Shop.currentUser();
    $("#account-label").textContent = user ? user.name.split(" ")[0] : t("acc.login");
    $("#account-btn").classList.toggle("is-member", !!user);
  }

  function renderPromo() {
    const user = Shop.currentUser();
    $("#promo-title").textContent = user ? t("promo.memberTitle", user.name.split(" ")[0]) : t("promo.title");
    $("#promo-text").textContent = user ? t("promo.memberText") : t("promo.text");
    const btn = $("#promo-btn");
    btn.textContent = user ? t("promo.memberBtn") : t("promo.btn");
    btn.onclick = () => (user ? document.getElementById("menu").scrollIntoView({ behavior: "smooth" }) : openAccount("register"));
  }

  function renderAll() {
    renderHeader();
    renderPromo();
    renderCart();
    renderStrip();
    if (openEl === accountModal) renderAccount();
    if (openEl === orderModal) renderOrder();
  }

  $("#cart-btn").addEventListener("click", openCart);
  $("#cart-bar").addEventListener("click", openCart);
  $("#account-btn").addEventListener("click", () => openAccount(Shop.currentUser() ? undefined : "login"));

  Shop.onChange((kind) => {
    if (kind === "auth") {
      const user = Shop.currentUser();
      if (user) {
        field("cname").value = user.name;
        field("cphone").value = user.phone;
      }
      renderHeader();
      renderPromo();
      renderCart();
      renderStrip();
      if (openEl === accountModal) renderAccount();
    } else {
      renderStrip();
      if (openEl === orderModal) renderOrder();
      if (openEl === accountModal && Shop.currentUser()) renderAccount();
      if (openEl === drawer && count()) renderPickup();
    }
  });
  document.addEventListener("langchange", renderAll);

  // Afhaaltijden en status schuiven mee met de klok
  setInterval(() => {
    if (openEl === drawer && count()) renderPickup();
    renderStrip();
  }, 30 * 1000);

  renderAll();

  return { qty, add, count, open: openCart };
})();
