// Keukenscherm: binnenkomende bestellingen volgen en de status bijwerken
(() => {
  const { t, fmtTime, fmtPrice, escapeHtml } = Shop;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const COLUMNS = [
    { key: "new", title: "k.new" },
    { key: "preparing", title: "k.preparing" },
    { key: "ready", title: "k.ready" },
    { key: "done", title: "k.done" },
  ];
  const NEXT = {
    new: { status: "preparing", label: "k.start" },
    preparing: { status: "ready", label: "k.markReady" },
    ready: { status: "done", label: "k.pickedUp" },
  };

  let knownNew = null;

  function visibleOrders() {
    const today = Shop.now().date;
    return Shop.orders().filter((o) =>
      ["done", "cancelled"].includes(o.status) ? o.createdDate === today : o.pickup.date >= today
    );
  }

  const sortKey = (o) => o.pickup.date + fmtTime(o.pickup.time);

  function card(o) {
    const next = NEXT[o.status];
    const placed = Shop.now().date === o.createdDate
      ? fmtTime(Shop.minsAt(o.createdAt))
      : Shop.dayLabel(o.createdDate);
    const pickupDay = o.pickup.date === Shop.now().date ? "" : `<small>${Shop.dayLabel(o.pickup.date)}</small>`;
    const qty = o.items.reduce((s, i) => s + i.qty, 0);
    const editable = o.status === "new" || o.status === "preparing";

    return `<article class="ticket ticket--${o.status}" data-id="${o.id}">
      <header class="ticket__head">
        <strong class="ticket__no">#${o.number}</strong>
        <div class="ticket__time">
          <span>${t("k.pickup")}</span>
          ${pickupDay}
          <div class="ticket__adjust">
            ${editable ? `<button type="button" data-shift="-5" aria-label="-5 min">−5</button>` : ""}
            <b>${fmtTime(o.pickup.time)}</b>
            ${editable ? `<button type="button" data-shift="5" aria-label="+5 min">+5</button>` : ""}
          </div>
        </div>
      </header>
      <div class="ticket__who">
        <strong>${escapeHtml(o.customer.name)}</strong>
        <a href="tel:${escapeHtml(o.customer.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(o.customer.phone)}</a>
        ${o.member ? `<span class="pill pill--ready">${t("k.member")}</span>` : ""}
      </div>
      <ul class="ticket__items">
        ${o.items.map((i) => `<li><b>${i.qty}×</b> ${escapeHtml(i.name)}</li>`).join("")}
      </ul>
      ${o.note ? `<p class="ticket__note">${escapeHtml(o.note)}</p>` : ""}
      <footer class="ticket__foot">
        <span>${t("k.placed", placed)} · ${t("cart.items", qty)} · <b>${fmtPrice(o.total)}</b></span>
        ${o.status === "cancelled" ? `<span class="pill pill--cancelled">${t("order.status.cancelled")}</span>` : ""}
      </footer>
      ${next || editable ? `<div class="ticket__actions">
        ${next ? `<button type="button" class="btn btn--primary" data-status="${next.status}">${t(next.label)}</button>` : ""}
        ${editable ? `<button type="button" class="btn btn--outline" data-status="cancelled">${t("k.cancel")}</button>` : ""}
      </div>` : ""}
    </article>`;
  }

  function render() {
    const list = visibleOrders().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    $("#board").innerHTML = COLUMNS.map((col) => {
      let items = list.filter((o) => (col.key === "done" ? ["done", "cancelled"].includes(o.status) : o.status === col.key));
      if (col.key === "done") items = items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 15);
      return `<section class="column column--${col.key}">
        <h2>${t(col.title)} <span class="column__count">${items.length}</span></h2>
        <div class="column__list">
          ${items.length ? items.map(card).join("") : `<p class="column__empty">${t("k.empty")}</p>`}
        </div>
      </section>`;
    }).join("");

    const newIds = list.filter((o) => o.status === "new").map((o) => o.id);
    if (knownNew && newIds.some((id) => !knownNew.has(id))) beep();
    knownNew = new Set(newIds);
  }

  $("#board").addEventListener("click", (e) => {
    const ticket = e.target.closest(".ticket");
    if (!ticket) return;
    const order = Shop.getOrder(ticket.dataset.id);
    if (!order) return;

    const statusBtn = e.target.closest("[data-status]");
    if (statusBtn) {
      const status = statusBtn.dataset.status;
      if (status === "cancelled" && !confirm(t("k.confirmCancel"))) return;
      Shop.updateOrder(order.id, { status });
    }
    const shiftBtn = e.target.closest("[data-shift]");
    if (shiftBtn) {
      const time = Math.max(0, Math.min(24 * 60 - 5, order.pickup.time + Number(shiftBtn.dataset.shift)));
      Shop.updateOrder(order.id, { pickup: { ...order.pickup, time }, timeChanged: true });
    }
  });

  /* ---------- Geluid ---------- */
  let audio = null;
  $("#sound").addEventListener("change", (e) => {
    if (e.target.checked && !audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audio = new Ctx();
    }
    if (e.target.checked) beep();
  });
  function beep() {
    if (!audio || !$("#sound").checked) return;
    [0, 0.18].forEach((delay) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + 0.15);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.16);
    });
  }

  /* ---------- Taal & klok ---------- */
  function applyLang() {
    $$("[data-i18n]").forEach((el) => {
      const val = t(el.dataset.i18n);
      if (typeof val === "string") el.innerHTML = val;
    });
    $("#lang").textContent = Shop.getLang() === "nl" ? "EN" : "NL";
    document.title = `${t("k.title")} · Cafetaria De Zeeheld`;
    render();
  }
  $("#lang").addEventListener("click", () => Shop.setLang(Shop.getLang() === "nl" ? "en" : "nl"));
  document.addEventListener("langchange", applyLang);

  const tick = () => { $("#clock").textContent = fmtTime(Shop.now().mins); };
  setInterval(tick, 10 * 1000);
  // Elke halve minuut opnieuw tekenen, ook als er niets binnenkomt (datumgrens, opslag geblokkeerd)
  setInterval(render, 30 * 1000);

  Shop.onChange(render);
  tick();
  applyLang();
})();
