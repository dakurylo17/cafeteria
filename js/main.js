(() => {
  const { t, fmtTime, fmtPrice, normalize, escapeHtml, slug, HOURS, WEEK_ORDER } = Shop;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Open / gesloten ---------- */
  function renderStatus() {
    const { day, mins } = Shop.now();
    const [open, close] = HOURS[day];
    const el = $("#status");
    let text;
    if (mins >= open && mins < close) {
      text = t("status.open", fmtTime(close));
      el.className = "status is-open";
    } else if (mins < open) {
      text = t("status.later", fmtTime(open));
      el.className = "status is-closed";
    } else {
      const next = (day + 1) % 7;
      text = t("status.next", t("status.tomorrow"), fmtTime(HOURS[next][0]));
      el.className = "status is-closed";
    }
    $("#status-text").textContent = text;
  }

  function renderHours() {
    const { day } = Shop.now();
    $("#hours-table tbody").innerHTML = WEEK_ORDER.map((d) => {
      const [o, c] = HOURS[d];
      const today = d === day;
      return `<tr class="${today ? "is-today" : ""}">
        <td>${t("days")[d]}${today ? `<span class="today-tag">${t("today")}</span>` : ""}</td>
        <td>${fmtTime(o)} – ${fmtTime(c)}</td>
      </tr>`;
    }).join("");
  }

  /* ---------- Menu ---------- */
  const grid = $("#menu-grid");
  const chips = $("#chips");
  const search = $("#search");
  const vegOnly = $("#veg-only");

  function highlight(name, q) {
    if (!q) return escapeHtml(name);
    const idx = normalize(name).indexOf(q);
    if (idx < 0) return escapeHtml(name);
    return escapeHtml(name.slice(0, idx)) + "<mark>" + escapeHtml(name.slice(idx, idx + q.length)) + "</mark>" + escapeHtml(name.slice(idx + q.length));
  }

  function addButton(id, name) {
    const qty = Cart.qty(id);
    return `<button type="button" class="add${qty ? " has-qty" : ""}" data-add="${id}" aria-label="${escapeHtml(t("menu.add"))}: ${escapeHtml(name)}">${qty || "+"}</button>`;
  }

  function renderMenu() {
    const q = normalize(search.value.trim());
    const veg = vegOnly.checked;
    let shown = 0;

    grid.innerHTML = MENU.map((cat) => {
      const items = cat.items.filter(([name, , flag]) => {
        const isVeg = cat.veg || flag === "veg";
        if (veg && !isVeg) return false;
        return !q || normalize(name).includes(q);
      });
      if (!items.length) return "";
      shown += items.length;
      const note = cat.note ? `<p class="cat__note">${cat.note[Shop.getLang()]}</p>` : "";
      // Foto alleen tonen als er niet gezocht/gefilterd wordt, zodat de resultaten compact blijven
      const photo = cat.photo && !q && !veg ? `<figure class="cat__photo">
          <img src="${cat.photo.src}" alt="${escapeHtml(cat.title[Shop.getLang()])}" loading="lazy" width="590" height="400">
          <figcaption>📷 ${escapeHtml(cat.photo.credit)}</figcaption>
        </figure>` : "";
      return `<article class="cat${photo ? " cat--photo" : ""}" id="cat-${cat.id}">
        ${photo}
        <header class="cat__head">
          <span class="cat__icon" aria-hidden="true">${cat.icon}</span>
          <h3>${cat.title[Shop.getLang()]}</h3>
          <span class="cat__count">${items.length} ${t("menu.items")}</span>
        </header>
        ${note}
        <ul>
          ${items.map(([name, price, flag]) => `<li class="item">
            <span class="item__name">${highlight(name, q)}${flag === "veg" ? '<span class="veg" title="Vegetarisch">V</span>' : ""}</span>
            <span class="item__dots" aria-hidden="true"></span>
            <span class="item__price">${fmtPrice(price)}</span>
            ${addButton(slug(name), name)}
          </li>`).join("")}
        </ul>
      </article>`;
    }).join("");

    $("#menu-empty").hidden = shown > 0;
    renderChips();
  }

  // Aantallen op de +-knoppen bijwerken zonder het hele menu opnieuw te tekenen
  function syncAddButtons() {
    $$("[data-add]", grid).forEach((btn) => {
      const qty = Cart.qty(btn.dataset.add);
      btn.classList.toggle("has-qty", qty > 0);
      btn.textContent = qty || "+";
    });
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    Cart.add(btn.dataset.add);
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
  });
  document.addEventListener("cartchange", syncAddButtons);

  function renderChips() {
    const visible = new Set($$(".cat", grid).map((el) => el.id.replace("cat-", "")));
    chips.innerHTML = MENU.filter((c) => visible.has(c.id)).map((c) =>
      `<button type="button" class="chip" data-target="cat-${c.id}">${c.icon} ${c.title[Shop.getLang()]}</button>`
    ).join("");
    lastActive = null;
    updateActiveChip();
  }

  function stickyOffset() {
    return $("#header").offsetHeight + $("#menu-tools").offsetHeight + 12;
  }

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - stickyOffset();
    window.scrollTo({ top: y, behavior: "smooth" });
  });

  let lastActive = null;
  function updateActiveChip() {
    const cats = $$(".cat", grid);
    if (!cats.length) return;
    const line = stickyOffset() + 40;
    // Bij een kolomlayout kunnen categorieën naast elkaar staan; kies de onderste die de lijn gepasseerd is
    let active = cats[0];
    let best = -Infinity;
    cats.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      if (top <= line && top > best) { best = top; active = el; }
    });
    const changed = active.id !== lastActive;
    lastActive = active.id;
    $$(".chip", chips).forEach((c) => {
      const on = c.dataset.target === active.id;
      c.classList.toggle("is-active", on);
      if (on && changed && chips.scrollWidth > chips.clientWidth) {
        const left = c.offsetLeft - chips.clientWidth / 2 + c.offsetWidth / 2;
        chips.scrollTo({ left, behavior: "smooth" });
      }
    });
  }

  search.addEventListener("input", renderMenu);
  vegOnly.addEventListener("change", renderMenu);

  /* ---------- Taal ---------- */
  function applyLang() {
    $$("[data-i18n]").forEach((el) => {
      const val = t(el.dataset.i18n);
      if (typeof val === "string") el.innerHTML = val;
    });
    $$("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    $$("[data-i18n-alt]").forEach((el) => {
      el.alt = t(el.dataset.i18nAlt);
    });
    $("#lang").textContent = Shop.getLang() === "nl" ? "EN" : "NL";
    renderStatus();
    renderHours();
    renderMenu();
  }

  $("#lang").addEventListener("click", () => {
    Shop.setLang(Shop.getLang() === "nl" ? "en" : "nl");
  });
  document.addEventListener("langchange", applyLang);

  /* ---------- Header & mobiele navigatie ---------- */
  const header = $("#header");
  const burger = $("#burger");
  const nav = $("#nav");

  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      burger.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    }
  });

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header.classList.toggle("is-scrolled", window.scrollY > 10);
      updateActiveChip();
      ticking = false;
    });
  }, { passive: true });

  /* ---------- Fotogalerij ---------- */
  const lightbox = $("#lightbox");
  const galleryItems = $$("#gallery .gallery__item");
  let lbIndex = 0;

  function showPhoto(i) {
    lbIndex = (i + galleryItems.length) % galleryItems.length;
    const item = galleryItems[lbIndex];
    const img = $("img", item);
    $("#lightbox-img").src = img.src;
    $("#lightbox-img").alt = img.alt;
    $("#lightbox-caption").textContent = `${t(item.dataset.caption)} · ${t("gal.photo")}: ${item.dataset.credit}`;
  }
  function openLightbox(i) {
    showPhoto(i);
    lightbox.hidden = false;
    document.body.classList.add("no-scroll");
    $(".lightbox__close", lightbox).focus({ preventScroll: true });
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove("no-scroll");
    galleryItems[lbIndex].focus({ preventScroll: true });
  }

  galleryItems.forEach((item, i) => item.addEventListener("click", () => openLightbox(i)));
  lightbox.addEventListener("click", (e) => {
    const action = (e.target.closest("[data-lb]") || {}).dataset;
    if (action && action.lb === "prev") showPhoto(lbIndex - 1);
    else if (action && action.lb === "next") showPhoto(lbIndex + 1);
    else if ((action && action.lb === "close") || e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showPhoto(lbIndex - 1);
    if (e.key === "ArrowRight") showPhoto(lbIndex + 1);
  });

  /* ---------- Animaties bij scrollen ---------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    $$(".section-head, .review, .card, .extras, .service, .promo__inner").forEach((el) => {
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  $("#year").textContent = new Date().getFullYear();
  applyLang();
  setInterval(renderStatus, 60 * 1000);
})();
