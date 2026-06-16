import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import WebApp from "@twa-dev/sdk";
import { CalendarDays, Users, Plus, Link, Home } from "lucide-react";
import { supabase, hasSupabaseConfig } from "./lib/supabase";
import "./styles.css";

const DEFAULT_MASTER_SLUG = "anna_okoshki";
const todayISO = new Date().toISOString().slice(0, 10);

function money(v) {
  return `${Number(v || 0).toLocaleString("ru-RU")}₽`;
}

function dateHuman(v) {
  if (!v) return "";
  return new Date(v + "T00:00:00").toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function normalizeTime(v) {
  return String(v || "").slice(0, 5);
}

function makeId() {
  return crypto.randomUUID();
}

const demoServices = [
  { id: makeId(), name: "Маникюр + покрытие", price: 1800, duration: 120 },
  { id: makeId(), name: "Брови: коррекция", price: 1200, duration: 60 },
];

const demoState = {
  master: {
    id: "local-master",
    name: "Анна Окошки",
    about: "Маникюр • Брови • Барбер • Тату",
    slug: "anna_okoshki",
    emoji: "✨",
    city: "Красноярск",
    category: "manicure",
    rating: 5,
    reviews_count: 2,
  },
  services: demoServices,
  slots: [
    { id: makeId(), service_id: demoServices[0].id, slot_date: todayISO, slot_time: "15:00", is_hot: false, is_active: true },
  ],
  bookings: [],
  clients: [],
  reviews: [],
};

const demoCategories = [
  { id: "all", slug: "all", name: "Все", emoji: "✨" },
  { id: "manicure", slug: "manicure", name: "Маникюр", emoji: "💅" },
  { id: "lashes", slug: "lashes", name: "Ресницы", emoji: "👁️" },
  { id: "brows", slug: "brows", name: "Брови", emoji: "🤨" },
  { id: "barber", slug: "barber", name: "Барбер", emoji: "💈" },
  { id: "tattoo", slug: "tattoo", name: "Тату", emoji: "🖋️" },
  { id: "massage", slug: "massage", name: "Массаж", emoji: "💆" },
];

function App() {
  const [mode, setMode] = useState(hasSupabaseConfig ? "supabase" : "local");
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("market");
  const [state, setState] = useState(demoState);
  const [masters, setMasters] = useState([demoState.master]);
  const [categories, setCategories] = useState(demoCategories);
  const [city, setCity] = useState("Красноярск");
  const [category, setCategory] = useState("all");
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [bookingForm, setBookingForm] = useState({ name: "", contact: "", note: "" });
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {}
  }, []);

  useEffect(() => {
    loadEverything();
  }, []);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 2400);
  }

  function serviceById(id) {
    return state.services.find((s) => s.id === id);
  }

  function slotById(id) {
    return state.slots.find((s) => s.id === id);
  }

  function bookingForSlot(slotId) {
    return state.bookings.find((b) => b.slot_id === slotId && b.status !== "cancelled");
  }

  async function loadEverything() {
    setLoading(true);

    if (!hasSupabaseConfig) {
      setMode("local");
      setLoading(false);
      return;
    }

    try {
      const [{ data: cats }, { data: masterList }] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("masters").select("*").eq("is_visible", true).order("rating", { ascending: false }),
      ]);

      if (cats?.length) setCategories([{ id: "all", slug: "all", name: "Все", emoji: "✨" }, ...cats]);
      if (masterList?.length) {
        setMasters(masterList);
        setCity(masterList[0].city || "Красноярск");
      }

      const params = new URLSearchParams(window.location.search);
      const slug = params.get("master") || masterList?.[0]?.slug || DEFAULT_MASTER_SLUG;

      await loadMaster(slug, false);
      setMode("supabase");
    } catch (e) {
      console.error(e);
      setMode("local");
      showToast("База не ответила, локальный режим");
    } finally {
      setLoading(false);
    }
  }

  async function loadMaster(slug, openProfile = true) {
    if (!hasSupabaseConfig) {
      setState(demoState);
      if (openProfile) setScreen("public");
      return;
    }

    const { data: master, error: masterError } = await supabase
      .from("masters")
      .select("*")
      .eq("slug", slug)
      .single();

    if (masterError) throw masterError;

    const [
      { data: services },
      { data: slots },
      { data: bookings },
      { data: clients },
      { data: reviews },
    ] = await Promise.all([
      supabase.from("services").select("*").eq("master_id", master.id).order("created_at"),
      supabase.from("slots").select("*").eq("master_id", master.id).eq("is_active", true).order("slot_date").order("slot_time"),
      supabase.from("bookings").select("*").eq("master_id", master.id).order("created_at", { ascending: false }),
      supabase.from("clients").select("*").eq("master_id", master.id).order("last_visit_at", { ascending: false }),
      supabase.from("reviews").select("*").eq("master_id", master.id).order("created_at", { ascending: false }),
    ]);

    setState({
      master,
      services: services || [],
      slots: slots || [],
      bookings: bookings || [],
      clients: clients || [],
      reviews: reviews || [],
    });

    if (openProfile) setScreen("public");
  }

  const activeBookings = state.bookings.filter((b) => b.status !== "cancelled");
  const freeSlots = state.slots.filter((s) => s.is_active !== false && !bookingForSlot(s.id));
  const todayBookings = activeBookings.filter((b) => slotById(b.slot_id)?.slot_date === todayISO);
  const todayIncome = todayBookings.reduce((sum, b) => {
    const slot = slotById(b.slot_id);
    const service = serviceById(slot?.service_id);
    return sum + Number(service?.price || 0);
  }, 0);

  const cities = useMemo(() => {
    const list = masters.map((m) => m.city).filter(Boolean);
    return Array.from(new Set(list.length ? list : ["Красноярск"]));
  }, [masters]);

  const filteredMasters = masters.filter((m) => {
    const cityOk = !city || m.city === city;
    const catOk = category === "all" || !category || m.category === category;
    return cityOk && catOk;
  });

  async function updateMaster(key, value) {
    setState((p) => ({ ...p, master: { ...p.master, [key]: value } }));

    if (mode === "supabase") {
      const { error } = await supabase.from("masters").update({ [key]: value }).eq("id", state.master.id);
      if (error) showToast("Не сохранил профиль: " + error.message);
    }
  }

  async function addService(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name")).trim();
    const price = Number(fd.get("price"));
    const duration = Number(fd.get("duration"));

    if (!name || !price || !duration) return showToast("Заполни услугу");

    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("services")
        .insert({ master_id: state.master.id, name, price, duration })
        .select()
        .single();

      if (error) return showToast("Ошибка: " + error.message);
      setState((p) => ({ ...p, services: [...p.services, data] }));
    }

    e.currentTarget.reset();
    showToast("Услуга добавлена");
  }

  async function addSlot(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const service_id = String(fd.get("service_id"));
    const slot_date = String(fd.get("date"));
    const slot_time = String(fd.get("time"));

    if (!service_id || !slot_date || !slot_time) return showToast("Заполни дату и время");

    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("slots")
        .insert({ master_id: state.master.id, service_id, slot_date, slot_time, is_hot: false, is_active: true })
        .select()
        .single();

      if (error) return showToast("Ошибка: " + error.message);
      setState((p) => ({ ...p, slots: [...p.slots, data] }));
    }

    e.currentTarget.reset();
    setScreen("public");
    showToast("Окошко опубликовано");
  }

  async function upsertClient(name, contact, note) {
    if (mode !== "supabase") {
      return { id: makeId(), name, contact, note, visits: 1 };
    }

    const { data: existing, error: findError } = await supabase
      .from("clients")
      .select("*")
      .eq("master_id", state.master.id)
      .eq("contact", contact)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { data, error } = await supabase
        .from("clients")
        .update({
          name,
          note: note || existing.note || "",
          visits: Number(existing.visits || 0) + 1,
          last_visit_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({ master_id: state.master.id, name, contact, note, visits: 1 })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function createBooking() {
    const slot = slotById(selectedSlotId);
    if (!slot) return;
    if (!bookingForm.name.trim() || !bookingForm.contact.trim()) return showToast("Введи имя и контакт");

    try {
      const name = bookingForm.name.trim();
      const contact = bookingForm.contact.trim();
      const note = bookingForm.note.trim();
      const client = await upsertClient(name, contact, note);

      const { data, error } = await supabase
        .from("bookings")
        .insert({
          master_id: state.master.id,
          slot_id: slot.id,
          client_id: client.id,
          client_name: name,
          client_contact: contact,
          note,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      setState((p) => ({
        ...p,
        bookings: [data, ...p.bookings],
        clients: p.clients.find((c) => c.id === client.id)
          ? p.clients.map((c) => (c.id === client.id ? client : c))
          : [client, ...p.clients],
      }));

      setSelectedSlotId(null);
      setBookingForm({ name: "", contact: "", note: "" });
      setScreen("bookings");
      showToast("Клиент записан");
    } catch (e) {
      console.error(e);
      showToast("Ошибка записи: " + e.message);
    }
  }

  async function cancelBooking(id) {
    if (mode === "supabase") {
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    }

    setState((p) => ({
      ...p,
      bookings: p.bookings.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
    }));
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(`${window.location.origin}/?master=${state.master.slug}`);
    showToast("Ссылка скопирована");
  }

  if (loading) {
    return (
      <div className="app">
        <header className="top glass">
          <div>
            <p className="label">Telegram Mini App</p>
            <h1>Окошки</h1>
            <p className="sub">Загружаем базу...</p>
          </div>
          <div className="logo">🪟</div>
        </header>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top glass">
        <div>
          <p className="label">{mode === "supabase" ? "Supabase connected" : "Local demo mode"}</p>
          <h1>Окошки</h1>
          <p className="sub">Маркетплейс свободных окошек в Telegram.</p>
        </div>
        <div className="logo">🪟</div>
      </header>

      <section className="stats">
        <Stat title="Сегодня" value={todayBookings.length} sub="записей" />
        <Stat title="Доход" value={money(todayIncome)} sub="за день" />
        <Stat title="Клиенты" value={state.clients.length} sub="в базе" />
      </section>

      <nav className="tabs">
        <Tab id="market" screen={screen} setScreen={setScreen} icon={<Home size={19} />} />
        <Tab id="public" screen={screen} setScreen={setScreen} icon={<Link size={19} />} />
        <Tab id="master" screen={screen} setScreen={setScreen} icon={<Plus size={19} />} />
        <Tab id="bookings" screen={screen} setScreen={setScreen} icon={<CalendarDays size={19} />} />
        <Tab id="clients" screen={screen} setScreen={setScreen} icon={<Users size={19} />} />
      </nav>

      {screen === "market" && (
        <main className="screen">
          <Card title="Найди мастера">
            <label>
              Город
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>

            <div className="chips">
              {categories.map((cat) => (
                <button
                  key={cat.slug}
                  className={category === cat.slug ? "chip active" : "chip"}
                  onClick={() => setCategory(cat.slug)}
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
          </Card>

          <h3>Мастера</h3>
          <div className="cards">
            {filteredMasters.length ? filteredMasters.map((m) => (
              <div className="item slotCard" key={m.id}>
                <div>
                  <h4>{m.emoji || "✨"} {m.name} {m.is_pro ? "👑" : ""}</h4>
                  <p className="muted">{m.city} · ⭐ {Number(m.rating || 5).toFixed(1)} · {m.reviews_count || 0} отзывов</p>
                </div>
                <button className="book" onClick={() => loadMaster(m.slug, true)}>Профиль</button>
              </div>
            )) : <Empty text="В этом городе пока нет мастеров." />}
          </div>

          <Card title="Для мастера">
            <p className="muted">Добавь услуги и свободные окошки — клиенты смогут записываться сами.</p>
            <button className="primary" onClick={() => setScreen("master")}>Кабинет мастера</button>
          </Card>
        </main>
      )}

      {screen === "public" && (
        <main className="screen">
          <div className="profile glass">
            <div className="photo">{state.master.emoji || "✨"}</div>
            <div>
              <p className="muted">Профиль мастера · {state.master.city}</p>
              <h2>{state.master.name}</h2>
              <p>{state.master.about}</p>
              <p className="linkText">⭐ {Number(state.master.rating || 5).toFixed(1)} · {state.master.reviews_count || 0} отзывов</p>
            </div>
          </div>

          <h3>Услуги</h3>
          <div className="chips">
            {state.services.map((s) => <span className="chip" key={s.id}>{s.name} · {money(s.price)}</span>)}
          </div>

          <h3>Свободные окошки</h3>
          <div className="cards">
            {freeSlots.length ? freeSlots.map((slot) => (
              <div className="item slotCard" key={slot.id}>
                <div>
                  <h4>{serviceById(slot.service_id)?.name}</h4>
                  <div className="row">
                    <span className="pill">📅 {dateHuman(slot.slot_date)}</span>
                    <span className="pill">⏰ {normalizeTime(slot.slot_time)}</span>
                    <span className="pill">{money(serviceById(slot.service_id)?.price)}</span>
                  </div>
                </div>
                <button className="book" onClick={() => setSelectedSlotId(slot.id)}>Записаться</button>
              </div>
            )) : <Empty text="Свободных окошек пока нет." />}
          </div>

          <h3>Отзывы</h3>
          <div className="cards">
            {state.reviews?.length ? state.reviews.map((r) => (
              <div className="item" key={r.id}>
                <h4>⭐ {r.rating} · {r.client_name}</h4>
                <p className="muted last">{r.text || "Без текста"}</p>
              </div>
            )) : <Empty text="Пока отзывов нет." />}
          </div>
        </main>
      )}

      {screen === "master" && (
        <main className="screen">
          <Card title="Профиль">
            <div className="form">
              <Input label="Имя мастера / студии" value={state.master.name} onChange={(v) => updateMaster("name", v)} />
              <Input label="Город" value={state.master.city || ""} onChange={(v) => updateMaster("city", v)} />
              <label>
                Категория
                <select value={state.master.category || "manicure"} onChange={(e) => updateMaster("category", e.target.value)}>
                  {categories.filter((c) => c.slug !== "all").map((c) => <option value={c.slug} key={c.slug}>{c.emoji} {c.name}</option>)}
                </select>
              </label>
              <Input label="Описание" value={state.master.about || ""} onChange={(v) => updateMaster("about", v)} />
              <Input label="Ссылка" value={state.master.slug || ""} onChange={(v) => updateMaster("slug", v.replaceAll(" ", "_").toLowerCase())} />
              <Input label="Эмодзи" value={state.master.emoji || ""} onChange={(v) => updateMaster("emoji", v)} />
            </div>
          </Card>

          <Card title="Добавить услугу">
            <form className="form" onSubmit={addService}>
              <input name="name" placeholder="Маникюр + покрытие" />
              <div className="two">
                <input name="price" type="number" placeholder="Цена" />
                <input name="duration" type="number" placeholder="Минут" />
              </div>
              <button className="primary">Добавить услугу</button>
            </form>
          </Card>

          <Card title="Добавить окошко">
            <form className="form" onSubmit={addSlot}>
              <select name="service_id">
                {state.services.map((s) => <option value={s.id} key={s.id}>{s.name} · {money(s.price)}</option>)}
              </select>
              <div className="two">
                <input name="date" type="date" />
                <input name="time" type="time" />
              </div>
              <button className="primary">Опубликовать</button>
            </form>
          </Card>
        </main>
      )}

      {screen === "bookings" && (
        <main className="screen">
          <Card title="Записи">
            <div className="cards">
              {activeBookings.length ? activeBookings.map((b) => {
                const slot = slotById(b.slot_id);
                const service = serviceById(slot?.service_id);
                return (
                  <div className="item" key={b.id}>
                    <h4>💬 {b.client_name}</h4>
                    <p className="muted">{b.client_contact}{b.note ? ` · ${b.note}` : ""}</p>
                    <div className="row">
                      <span className="pill">{service?.name}</span>
                      <span className="pill">📅 {dateHuman(slot?.slot_date)}</span>
                      <span className="pill">⏰ {normalizeTime(slot?.slot_time)}</span>
                      <span className="pill">{money(service?.price)}</span>
                    </div>
                    <button className="mini red" onClick={() => cancelBooking(b.id)}>Отменить запись</button>
                  </div>
                );
              }) : <Empty text="Пока записей нет." />}
            </div>
          </Card>
        </main>
      )}

      {screen === "clients" && (
        <main className="screen">
          <Card title="Клиенты">
            <div className="cards">
              {state.clients.length ? state.clients.map((c) => (
                <div className="item" key={c.id}>
                  <h4>{c.visits >= 3 ? "💎 " : "👤 "}{c.name}</h4>
                  <p className="muted">{c.contact}{c.note ? ` · ${c.note}` : ""}</p>
                  <div className="row">
                    <span className="pill">{c.visits} посещ.</span>
                    <span className="pill">{c.visits >= 3 ? "VIP" : "новый"}</span>
                  </div>
                </div>
              )) : <Empty text="База клиентов появится после первых записей." />}
            </div>
          </Card>
        </main>
      )}

      {selectedSlotId && (
        <div className="modal">
          <div className="modalBox glass">
            <button className="close" onClick={() => setSelectedSlotId(null)}>×</button>
            <h2>Записаться</h2>
            <p className="muted">{(() => {
              const slot = slotById(selectedSlotId);
              const service = serviceById(slot?.service_id);
              return `${service?.name} · ${dateHuman(slot?.slot_date)} · ${normalizeTime(slot?.slot_time)} · ${money(service?.price)}`;
            })()}</p>
            <input placeholder="Имя" value={bookingForm.name} onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })} />
            <input placeholder="@telegram или телефон" value={bookingForm.contact} onChange={(e) => setBookingForm({ ...bookingForm, contact: e.target.value })} />
            <input placeholder="Комментарий" value={bookingForm.note} onChange={(e) => setBookingForm({ ...bookingForm, note: e.target.value })} />
            <button className="primary" onClick={createBooking}>Подтвердить запись</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      <footer><button className="reset" onClick={() => loadEverything()}>Обновить из базы</button></footer>
    </div>
  );
}

function Stat({ title, value, sub }) {
  return <div className="stat glass"><span>{title}</span><b>{value}</b><small>{sub}</small></div>;
}

function Tab({ id, screen, setScreen, icon }) {
  return <button className={screen === id ? "tab active" : "tab"} onClick={() => setScreen(id)}>{icon}</button>;
}

function Card({ title, children }) {
  return <section className="cardOuter glass"><h2>{title}</h2>{children}</section>;
}

function Empty({ text }) {
  return <div className="item"><p className="muted last">{text}</p></div>;
}

function Input({ label, value, onChange }) {
  return <label>{label}<input value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

createRoot(document.getElementById("root")).render(<App />);
