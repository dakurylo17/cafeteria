// Gedeelde logica voor website en keuken: taal, openingstijden, afhaaltijden, accounts en bestellingen.
//
// DEMO-OPSLAG: alles wordt in localStorage van de browser bewaard. Voor echte bestellingen
// moeten de functies onder "Accounts" en "Bestellingen" naar een server (API/database) gaan;
// de rest van de site praat alleen met deze functies en hoeft dan niet te veranderen.
const Shop = (() => {
  // Openingstijden per dag (0 = zondag), in minuten na middernacht
  const HOURS = {
    0: [16 * 60, 22 * 60],
    1: [16 * 60, 22 * 60],
    2: [16 * 60, 22 * 60],
    3: [11 * 60 + 30, 22 * 60],
    4: [11 * 60 + 30, 22 * 60],
    5: [11 * 60 + 30, 22 * 60],
    6: [11 * 60 + 30, 22 * 60],
  };
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DISCOUNT = 0.10;          // ledenkorting
  const BASE_PREP = 10;           // minuten voor een bestelling met 1 item
  const PREP_PER_ITEM = 1;        // extra minuten per extra item
  const PREP_PER_QUEUED = 3;      // extra minuten per bestelling die al in de keuken ligt
  const MAX_PREP = 45;
  const LAST_PICKUP = 10;         // laatste afhaaltijd: 10 minuten voor sluiting
  const SLOT_STEP = 15;           // keuzetijden per kwartier

  const KEY = {
    lang: "zeeheld-lang",
    users: "zeeheld-users",
    session: "zeeheld-session",
    orders: "zeeheld-orders",
    mine: "zeeheld-my-orders",
    cart: "zeeheld-cart",
  };
  const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  const emit = (kind) => document.dispatchEvent(new CustomEvent("shopchange", { detail: kind }));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- Taal ---------- */
  let lang = read(KEY.lang, "nl");
  if (!I18N[lang]) lang = "nl";
  document.documentElement.lang = lang;

  function t(key, ...args) {
    const val = I18N[lang][key] ?? I18N.nl[key] ?? key;
    return typeof val === "function" ? val(...args) : val;
  }
  function setLang(next) {
    lang = next;
    write(KEY.lang, next);
    document.documentElement.lang = next;
    document.dispatchEvent(new CustomEvent("langchange"));
  }

  /* ---------- Opmaak ---------- */
  const fmtTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const fmtPrice = (n) => "€ " + n.toFixed(2).replace(".", ",");
  const round2 = (n) => Math.round(n * 100) / 100;
  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = (s) => normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Tijd (altijd Groningse tijd) ---------- */
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function partsOf(date) {
    const p = dtf.formatToParts(date);
    const get = (type) => p.find((x) => x.type === type).value;
    return {
      day: DAY_KEYS.indexOf(get("weekday")),
      mins: Number(get("hour")) * 60 + Number(get("minute")),
      date: `${get("year")}-${get("month")}-${get("day")}`,
    };
  }
  const now = () => partsOf(new Date());
  const minsAt = (ms) => partsOf(new Date(ms)).mins;
  const daysFromNow = (n) => partsOf(new Date(Date.now() + n * 86400000));

  function dayName(day) {
    const name = t("days")[day];
    return lang === "nl" ? name.toLowerCase() : name;
  }
  // "vandaag", "morgen" of de naam van de dag, voor een datum binnen een week
  function dayLabel(date) {
    for (let i = 0; i < 7; i++) {
      const p = daysFromNow(i);
      if (p.date === date) return i === 0 ? t("today") : i === 1 ? t("status.tomorrow") : dayName(p.day);
    }
    return date;
  }
  // "om 17:25", "morgen om 11:40"
  function whenText(date, mins) {
    const prefix = date === now().date ? "" : dayLabel(date) + " ";
    return `${prefix}${t("at")} ${fmtTime(mins)}`;
  }

  /* ---------- Afhaaltijden ---------- */
  function activeKitchenOrders() {
    return orders().filter((o) => o.status === "new" || o.status === "preparing");
  }
  function prepMinutes(qty) {
    const extra = Math.max(0, qty - 1) * PREP_PER_ITEM + activeKitchenOrders().length * PREP_PER_QUEUED;
    return Math.min(MAX_PREP, BASE_PREP + extra);
  }
  // Vroegste afhaaltijd en keuzetijden voor de eerstvolgende dag waarop we open zijn
  function pickupPlan(qty) {
    const prep = prepMinutes(qty);
    const cur = now();
    for (let offset = 0; offset < 8; offset++) {
      const p = offset === 0 ? cur : daysFromNow(offset);
      const [open, close] = HOURS[p.day];
      const last = close - LAST_PICKUP;
      const start = offset === 0 ? Math.max(cur.mins, open) : open;
      const earliest = Math.ceil((start + prep) / 5) * 5;
      if (earliest > last) continue;
      const slots = [];
      for (let s = Math.ceil((earliest + 1) / SLOT_STEP) * SLOT_STEP; s <= last; s += SLOT_STEP) slots.push(s);
      return {
        date: p.date,
        earliest,
        slots,
        prep,
        openNow: offset === 0 && cur.mins >= open && cur.mins < close,
      };
    }
    return null;
  }

  /* ---------- Accounts ---------- */
  async function hash(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return "b64:" + btoa(unescape(encodeURIComponent(text)));
  }
  const users = () => read(KEY.users, []);
  const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, phone: u.phone };

  function currentUser() {
    const session = read(KEY.session, null);
    if (!session) return null;
    return publicUser(users().find((u) => u.id === session.userId));
  }
  async function register({ name, email, phone, password }) {
    email = email.trim().toLowerCase();
    const list = users();
    if (list.some((u) => u.email === email)) throw new Error("taken");
    const user = {
      id: uid(),
      name: name.trim(),
      email,
      phone: phone.trim(),
      pass: await hash(email + ":" + password),
      createdAt: Date.now(),
    };
    list.push(user);
    if (!write(KEY.users, list) || !write(KEY.session, { userId: user.id })) throw new Error("storage");
    emit("auth");
    return publicUser(user);
  }
  async function login(email, password) {
    email = email.trim().toLowerCase();
    const pass = await hash(email + ":" + password);
    const user = users().find((u) => u.email === email && u.pass === pass);
    if (!user) throw new Error("login");
    write(KEY.session, { userId: user.id });
    emit("auth");
    return publicUser(user);
  }
  function logout() {
    write(KEY.session, null);
    emit("auth");
  }

  /* ---------- Bestellingen ---------- */
  const orders = () => read(KEY.orders, []);
  function saveOrders(list) {
    const ok = write(KEY.orders, list);
    emit("orders");
    return ok;
  }
  function quote(items, member) {
    const subtotal = round2(items.reduce((sum, i) => sum + i.price * i.qty, 0));
    const discount = member ? round2(subtotal * DISCOUNT) : 0;
    return { subtotal, discount, total: round2(subtotal - discount) };
  }
  function placeOrder({ items, customer, pickup, note }) {
    const user = currentUser();
    const list = orders();
    const today = now().date;
    const order = {
      id: uid(),
      number: 101 + list.filter((o) => o.createdDate === today).length,
      createdAt: Date.now(),
      createdDate: today,
      userId: user ? user.id : null,
      member: !!user,
      customer,
      items,
      ...quote(items, !!user),
      pickup,
      note,
      status: "new",
      timeChanged: false,
    };
    list.push(order);
    if (!saveOrders(list)) throw new Error("storage");
    write(KEY.mine, [...read(KEY.mine, []), order.id]);
    return order;
  }
  const getOrder = (id) => orders().find((o) => o.id === id) || null;
  function myOrders() {
    const user = currentUser();
    const mine = new Set(read(KEY.mine, []));
    return orders()
      .filter((o) => mine.has(o.id) || (user && o.userId === user.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function activeOrder() {
    const today = now().date;
    return myOrders().find((o) => ["new", "preparing", "ready"].includes(o.status) && o.pickup.date >= today) || null;
  }
  function updateOrder(id, patch) {
    const list = orders();
    const order = list.find((o) => o.id === id);
    if (!order) return null;
    Object.assign(order, patch);
    saveOrders(list);
    return order;
  }

  // Wijzigingen volgen, ook uit andere tabbladen (bijv. de keuken)
  function onChange(cb) {
    document.addEventListener("shopchange", (e) => cb(e.detail));
    window.addEventListener("storage", (e) => {
      if (e.key === KEY.orders) cb("orders");
      if (e.key === KEY.session || e.key === KEY.users) cb("auth");
    });
  }

  return {
    HOURS, WEEK_ORDER, DISCOUNT, KEY,
    read, write,
    t, setLang, getLang: () => lang,
    fmtTime, fmtPrice, round2, normalize, slug, escapeHtml,
    now, minsAt, dayName, dayLabel, whenText,
    prepMinutes, pickupPlan,
    currentUser, register, login, logout,
    orders, quote, placeOrder, getOrder, myOrders, activeOrder, updateOrder,
    onChange,
  };
})();
