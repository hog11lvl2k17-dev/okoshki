import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import WebApp from "@twa-dev/sdk";
import { CalendarDays, Users, Plus, Link, Home } from "lucide-react";
import { supabase, hasSupabaseConfig } from "./lib/supabase";
import "./styles.css";

const MASTER_SLUG = "anna_okoshki";
const todayISO = new Date().toISOString().slice(0, 10);

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")}₽`;
}

function dateHuman(value) {
  if (!value) return "";
  return new Date(value + "T00:00:00").toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function makeId() {
  return crypto.randomUUID();
}

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

const fallbackServices = [
  { id: makeId(), name: "Маникюр + покрытие", price: 1800, duration: 120 },
  { id: makeId(), name: "Брови: коррекция", price: 1200, duration: 60 },
];

const fallbackState = {
  master: {
    id: "local-master",
    name: "Анна Окошки",
    about: "Маникюр • Брови • Барбер • Тату",
    slug: "anna_okoshki",
    emoji: "✨",
  },
  services: fallbackServices,
  slots: [
    { id: makeId(), service_id: fallbackServices[0].id, slot_date: todayISO, slot_time: "14:00", is_hot: false, is_active: true },
    { id: makeId(), service_id: fallbackServices[1].id, slot_date: todayISO, slot_time: "17:30", is_hot: true, is_active: true },
  ],
  bookings: [],
  clients: [],
};

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem("okoshki_local_fallback")) || fallbackState;
  } catch {
    return fallbackState;
  }
}

function saveLocal(state) {
  localStorage.setItem("okoshki_local_fallback", JSON.stringify(state));
}

function App() {
  const [mode, setMode] = useState(hasSupabaseConfig ? "supabase" : "local");
  const [state, setState] = useState(loadLocal);
  const [screen, setScreen] = useState("home");
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [bookingForm, setBookingForm] = useState({ name: "", contact: "", note: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {}
  }, []);

  useEffect(() => {
    if (mode === "local") saveLocal(state);
  }, [state, mode]);

  useEffect(() => {
    if (hasSupabaseConfig) {
      loadFromSupabase();
    } else {
      setLoading(false);
      showToast("Supabase не подключен, работает локальная демка");
    }
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

  async function loadFromSupabase() {
    setLoading(true);

    try {
      const { data: master, error: masterError } = await supabase
        .from("masters")
        .select("*")
        .eq("slug", MASTER_SLUG)
        .single();

      if (masterError) throw masterError;

      const [
        { data: services, error: servicesError },
        { data: slots, error: slotsError },
        { data: bookings, error: bookingsError },
        { data: clients, error: clientsError },
      ] = await Promise.all([
        supabase.from("services").select("*").eq("master_id", master.id).order("created_at", { ascending: true }),
        supabase.from("slots").select("*").eq("master_id", master.id).eq("is_active", true).order("slot_date", { ascending: true }).order("slot_time", { ascending: true }),
        supabase.from("bookings").select("*").eq("master_id", master.id).order("created_at", { ascending: false }),
        supabase.from("clients").select("*").eq("master_id", master.id).order("last_visit_at", { ascending: false }),
      ]);

      if (servicesError) throw servicesError;
      if (slotsError) throw slotsError;
      if (bookingsError) throw bookingsError;
      if (clientsError) throw clientsError;

      setMode("supabase");
      setState({
        master,
        services: services || [],
        slots: slots || [],
        bookings: bookings || [],
        clients: clients || [],
      });
    } catch (err) {
      console.error(err);
      setMode("local");
      showToast("База не ответила, включил локальный режим");
    } finally {
      setLoading(false);
    }
  }

  const activeBookings = state.bookings.filter((b) => b.status !== "cancelled");

  const todayBookings = activeBookings.filter((b) => slotById(b.slot_id)?.slot_date === todayISO);

  const todayIncome = todayBookings.reduce((sum, b) => {
    const slot = slotById(b.slot_id);
    const service = serviceById(slot?.service_id);
    return sum + (service?.price || 0);
  }, 0);

  const freeSlots = state.slots
    .filter((slot) => slot.is_active !== false && !bookingForSlot(slot.id))
    .sort((a, b) => (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time));

  const nextBooking = useMemo(() => {
    return activeBookings
      .map((booking) => ({ booking, slot: slotById(booking.slot_id) }))
      .filter((x) => x.slot)
      .sort((a, b) => (a.slot.slot_date + a.slot.slot_time).localeCompare(b.slot.slot_date + b.slot.slot_time))[0];
  }, [state]);

  async function updateMaster(key, value) {
    setState((prev) => ({ ...prev, master: { ...prev.master, [key]: value } }));

    if (mode === "supabase") {
      const { error } = await supabase
        .from("masters")
        .update({ [key]: value })
        .eq("id", state.master.id);

      if (error) showToast("Не сохранил профиль: " + error.message);
    }
  }

  async function addService(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name")).trim();
    const price = Number(data.get("price"));
    const duration = Number(data.get("duration"));

    if (!name || !price || !duration) return showToast("Заполни услугу полностью");

    if (mode === "supabase") {
      const { data: row, error } = await supabase
        .from("services")
        .insert({ master_id: state.master.id, name, price, duration })
        .select()
        .single();

      if (error) return showToast("Ошибка услуги: " + error.message);
      setState((prev) => ({ ...prev, services: [...prev.services, row] }));
    } else {
      setState((prev) => ({
        ...prev,
        services: [...prev.services, { id: makeId(), name, price, duration }],
      }));
    }

    e.currentTarget.reset();
    showToast("Услуга добавлена");
  }

  async function addSlot(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const service_id = String(data.get("service_id"));
    const slot_date = String(data.get("date"));
    const slot_time = String(data.get("time"));

    if (!service_id || !slot_date || !slot_time) return showToast("Заполни окошко полностью");

    if (mode === "supabase") {
      const { data: row, error } = await supabase
        .from("slots")
        .insert({
          master_id: state.master.id,
          service_id,
          slot_date,
          slot_time,
          is_hot: false,
          is_active: true,
        })
        .select()
        .single();

      if (error) return showToast("Ошибка окошка: " + error.message);
      setState((prev) => ({ ...prev, slots: [...prev.slots, row] }));
    } else {
      setState((prev) => ({
        ...prev,
        slots: [...prev.slots, { id: makeId(), service_id, slot_date, slot_time, is_hot: false, is_active: true }],
      }));
    }

    e.currentTarget.reset();
    setScreen("public");
    showToast("Окошко опубликовано");
  }

  async function deleteSlot(id) {
    if (bookingForSlot(id)) return showToast("Нельзя удалить занятое окошко");

    if (mode === "supabase") {
      const { error } = await supabase.from("slots").update({ is_active: false }).eq("id", id);
      if (error) return showToast("Ошибка удаления: " + error.message);
    }

    setState((prev) => ({ ...prev, slots: prev.slots.filter((s) => s.id !== id) }));
    showToast("Окошко удалено");
  }

  async function makeHot(id) {
    const slot = slotById(id);
    const nextValue = !slot?.is_hot;

    if (mode === "supabase") {
      const { error } = await supabase.from("slots").update({ is_hot: nextValue }).eq("id", id);
      if (error) return showToast("Ошибка: " + error.message);
    }

    setState((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, is_hot: nextValue } : s)),
    }));
  }

  async function upsertClient(name, contact, note) {
    const existing = state.clients.find((c) => c.contact.toLowerCase() === contact.toLowerCase());

    if (mode === "supabase") {
      if (existing) {
        const { data: row, error } = await supabase
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
        return row;
      }

      const { data: row, error } = await supabase
        .from("clients")
        .insert({
          master_id: state.master.id,
          name,
          contact,
          note,
          visits: 1,
        })
        .select()
        .single();

      if (error) throw error;
      return row;
    }

    if (existing) {
      return { ...existing, name, note: note || existing.note || "", visits: Number(existing.visits || 0) + 1 };
    }

    return {
      id: makeId(),
      name,
      contact,
      note,
      visits: 1,
      created_at: new Date().toISOString(),
      last_visit_at: new Date().toISOString(),
    };
  }

  async function createBooking() {
    const slot = slotById(selectedSlotId);
    if (!slot) return;
    if (!bookingForm.name.trim() || !bookingForm.contact.trim()) return showToast("Введи имя и контакт");
    if (bookingForSlot(slot.id)) return showToast("Окошко уже занято");

    const name = bookingForm.name.trim();
    const contact = bookingForm.contact.trim();
    const note = bookingForm.note.trim();

    try {
      const client = await upsertClient(name, contact, note);
      let booking;

      if (mode === "supabase") {
        const { data: row, error } = await supabase
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
        booking = row;
      } else {
        booking = {
          id: makeId(),
          master_id: state.master.id,
          slot_id: slot.id,
          client_id: client.id,
          client_name: name,
          client_contact: contact,
          note,
          status: "active",
          created_at: new Date().toISOString(),
        };
      }

      setState((prev) => ({
        ...prev,
        clients: prev.clients.find((c) => c.id === client.id)
          ? prev.clients.map((c) => (c.id === client.id ? client : c))
          : [client, ...prev.clients],
        bookings: [booking, ...prev.bookings],
      }));

      setSelectedSlotId(null);
      setBookingForm({ name: "", contact: "", note: "" });
      setScreen("bookings");
      showToast("Клиент записан");
    } catch (err) {
      console.error(err);
      showToast("Ошибка записи: " + err.message);
    }
  }

  async function cancelBooking(id) {
    const booking = state.bookings.find((b) => b.id === id);

    if (mode === "supabase") {
      const { error: bookingError } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
      if (bookingError) return showToast("Ошибка отмены: " + bookingError.message);

      if (booking?.slot_id) {
        await supabase.from("slots").update({ is_hot: true }).eq("id", booking.slot_id);
      }
    }

    setState((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
      slots: prev.slots.map((s) => (s.id === booking?.slot_id ? { ...s, is_hot: true } : s)),
    }));

    showToast("Запись отменена, окошко снова свободно");
  }

  async function copyLink() {
    const text = `${window.location.origin}/?master=${state.master.slug || MASTER_SLUG}`;
    await navigator.clipboard?.writeText(text);
    showToast("Ссылка скопирована");
  }

  async function hotPost() {
    const slot = freeSlots[0];
    if (!slot) return showToast("Нет свободных окошек");
    const service = serviceById(slot.service_id);
    const text = `⚡ Освободилось окошко!\n\n${service?.name}\n${dateHuman(slot.slot_date)} в ${normalizeTime(slot.slot_time)}\n${money(service?.price)}\n\nЗапись: ${window.location.origin}/?master=${state.master.slug}`;
    await navigator.clipboard?.writeText(text);
    await makeHot(slot.id);
    showToast("Пост скопирован");
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
          <p className="sub">Заполняй свободные часы, а не таблицы.</p>
        </div>
        <div className="logo">🪟</div>
      </header>

      <section className="stats">
        <Stat title="Сегодня" value={todayBookings.length} sub="записей" />
        <Stat title="Доход" value={money(todayIncome)} sub="за день" />
        <Stat title="Клиенты" value={state.clients.length} sub="в базе" />
      </section>

      <nav className="tabs">
        <Tab id="home" screen={screen} setScreen={setScreen} icon={<Home size={19} />} />
        <Tab id="public" screen={screen} setScreen={setScreen} icon={<Link size={19} />} />
        <Tab id="master" screen={screen} setScreen={setScreen} icon={<Plus size={19} />} />
        <Tab id="bookings" screen={screen} setScreen={setScreen} icon={<CalendarDays size={19} />} />
        <Tab id="clients" screen={screen} setScreen={setScreen} icon={<Users size={19} />} />
      </nav>

      {screen === "home" && (
        <main className="screen">
          <div className="quickGrid">
            <button className="quick dark" onClick={() => setScreen("master")}>➕ Добавить окошко</button>
            <button className="quick" onClick={() => setScreen("public")}>👀 Страница клиента</button>
            <button className="quick" onClick={copyLink}>🔗 Скопировать ссылку</button>
            <button className="quick fire" onClick={hotPost}>⚡ Освободилось</button>
          </div>

          <Card title="Следующая запись">
            {nextBooking ? (
              <BookingMini booking={nextBooking.booking} slot={nextBooking.slot} service={serviceById(nextBooking.slot.service_id)} />
            ) : (
              <p className="muted last">Записей пока нет. Открой страницу клиента и сделай тест.</p>
            )}
          </Card>

          <Card title="Текущий этап">
            <p className="muted last">База Supabase подключена. Теперь данные должны быть общими между устройствами.</p>
          </Card>
        </main>
      )}

      {screen === "public" && (
        <main className="screen">
          <div className="profile glass">
            <div className="photo">{state.master.emoji || "✨"}</div>
            <div>
              <p className="muted">Личная страница</p>
              <h2>{state.master.name}</h2>
              <p>{state.master.about}</p>
              <p className="linkText">okoshki.app/{state.master.slug}</p>
            </div>
          </div>

          <h3>Услуги</h3>
          <div className="chips">
            {state.services.map((s) => <span className="chip" key={s.id}>{s.name} · {money(s.price)}</span>)}
          </div>

          <h3>Свободные окошки</h3>
          <div className="cards">
            {freeSlots.length ? freeSlots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} service={serviceById(slot.service_id)} onBook={() => setSelectedSlotId(slot.id)} />
            )) : <Empty text="Свободных окошек пока нет." />}
          </div>
        </main>
      )}

      {screen === "master" && (
        <main className="screen">
          <Card title="Профиль">
            <div className="form">
              <Input label="Имя мастера / студии" value={state.master.name} onChange={(v) => updateMaster("name", v)} />
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

          <Card title="Окошки">
            <div className="cards">
              {state.slots.map((slot) => (
                <AdminSlot key={slot.id} slot={slot} service={serviceById(slot.service_id)} booked={bookingForSlot(slot.id)} onHot={() => makeHot(slot.id)} onDelete={() => deleteSlot(slot.id)} />
              ))}
            </div>
          </Card>
        </main>
      )}

      {screen === "bookings" && (
        <main className="screen">
          <Card title="Записи">
            <div className="cards">
              {activeBookings.length ? activeBookings.map((b) => {
                const slot = slotById(b.slot_id);
                return <BookingCard key={b.id} booking={b} slot={slot} service={serviceById(slot?.service_id)} onCancel={() => cancelBooking(b.id)} />;
              }) : <Empty text="Пока записей нет." />}
            </div>
          </Card>
        </main>
      )}

      {screen === "clients" && (
        <main className="screen">
          <Card title="Клиенты">
            <div className="cards">
              {state.clients.length ? state.clients.map((c) => <ClientCard key={c.id} client={c} />) : <Empty text="База клиентов появится после первых записей." />}
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

      <footer>
        <button className="reset" onClick={() => loadFromSupabase()}>Обновить из базы</button>
      </footer>
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

function SlotCard({ slot, service, onBook }) {
  return (
    <div className="item slotCard">
      <div>
        <h4>{service?.name}</h4>
        <div className="row">
          <span className="pill">📅 {dateHuman(slot.slot_date)}</span>
          <span className="pill">⏰ {normalizeTime(slot.slot_time)}</span>
          <span className="pill">{money(service?.price)}</span>
          {slot.is_hot && <span className="pill hot">⚡ горит</span>}
        </div>
      </div>
      <button className="book" onClick={onBook}>Записаться</button>
    </div>
  );
}

function AdminSlot({ slot, service, booked, onHot, onDelete }) {
  return (
    <div className="item">
      <h4>{service?.name}</h4>
      <div className="row">
        <span className="pill">📅 {dateHuman(slot.slot_date)}</span>
        <span className="pill">⏰ {normalizeTime(slot.slot_time)}</span>
        <span className="pill">{booked ? "занято" : "свободно"}</span>
        {slot.is_hot && <span className="pill hot">⚡ горит</span>}
      </div>
      <div className="actions">
        <button className="mini" onClick={onHot}>⚡ Горящее</button>
        <button className="mini red" onClick={onDelete}>Удалить</button>
      </div>
    </div>
  );
}

function BookingMini({ booking, slot, service }) {
  return (
    <div className="item">
      <h4>{booking.client_name}</h4>
      <p className="muted">{booking.client_contact}</p>
      <div className="row">
        <span className="pill">{service?.name}</span>
        <span className="pill">{dateHuman(slot.slot_date)}</span>
        <span className="pill">{normalizeTime(slot.slot_time)}</span>
      </div>
    </div>
  );
}

function BookingCard({ booking, slot, service, onCancel }) {
  return (
    <div className="item">
      <h4>💬 {booking.client_name}</h4>
      <p className="muted">{booking.client_contact}{booking.note ? ` · ${booking.note}` : ""}</p>
      <div className="row">
        <span className="pill">{service?.name}</span>
        <span className="pill">📅 {dateHuman(slot?.slot_date)}</span>
        <span className="pill">⏰ {normalizeTime(slot?.slot_time)}</span>
        <span className="pill">{money(service?.price)}</span>
      </div>
      <div className="actions">
        <button className="mini red" onClick={onCancel}>Отменить запись</button>
      </div>
    </div>
  );
}

function ClientCard({ client }) {
  return (
    <div className="item">
      <h4>{client.visits >= 3 ? "💎 " : "👤 "}{client.name}</h4>
      <p className="muted">{client.contact}{client.note ? ` · ${client.note}` : ""}</p>
      <div className="row">
        <span className="pill">{client.visits} посещ.</span>
        <span className="pill">{client.visits >= 3 ? "VIP" : "новый"}</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
