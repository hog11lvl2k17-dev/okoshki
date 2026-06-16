import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import WebApp from "@twa-dev/sdk";
import { CalendarDays, Users, Plus, Link, Flame, Home, ClipboardList } from "lucide-react";
import "./styles.css";

const todayISO = new Date().toISOString().slice(0, 10);

const makeId = () => crypto.randomUUID();

const starterServices = [
  { id: makeId(), name: "Маникюр + покрытие", price: 1800, duration: 120 },
  { id: makeId(), name: "Брови: коррекция", price: 1200, duration: 60 },
  { id: makeId(), name: "Барбер: стрижка", price: 1500, duration: 60 },
];

const starter = {
  master: {
    name: "Анна Окошки",
    about: "Маникюр • Брови • Барбер • Тату",
    slug: "anna_okoshki",
    emoji: "✨",
  },
  services: starterServices,
  slots: [
    { id: makeId(), serviceId: starterServices[0].id, date: todayISO, time: "14:00", hot: false },
    { id: makeId(), serviceId: starterServices[1].id, date: todayISO, time: "17:30", hot: true },
    { id: makeId(), serviceId: starterServices[2].id, date: "2026-06-18", time: "12:00", hot: false },
  ],
  bookings: [],
  clients: [],
};

function loadState() {
  try {
    return JSON.parse(localStorage.getItem("okoshki_real_mvp")) || starter;
  } catch {
    return starter;
  }
}

function saveState(state) {
  localStorage.setItem("okoshki_real_mvp", JSON.stringify(state));
}

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")}₽`;
}

function dateHuman(value) {
  return new Date(value + "T00:00:00").toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function App() {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("home");
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
    saveState(state);
  }, [state]);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 1800);
  }

  function serviceById(id) {
    return state.services.find((s) => s.id === id);
  }

  function slotById(id) {
    return state.slots.find((s) => s.id === id);
  }

  function bookingForSlot(slotId) {
    return state.bookings.find((b) => b.slotId === slotId && b.status !== "cancelled");
  }

  const activeBookings = state.bookings.filter((b) => b.status !== "cancelled");

  const todayBookings = activeBookings.filter((b) => slotById(b.slotId)?.date === todayISO);

  const todayIncome = todayBookings.reduce((sum, b) => {
    const slot = slotById(b.slotId);
    const service = serviceById(slot?.serviceId);
    return sum + (service?.price || 0);
  }, 0);

  const nextBooking = useMemo(() => {
    return activeBookings
      .map((booking) => ({ booking, slot: slotById(booking.slotId) }))
      .filter((x) => x.slot)
      .sort((a, b) => (a.slot.date + a.slot.time).localeCompare(b.slot.date + b.slot.time))[0];
  }, [state]);

  const freeSlots = state.slots
    .filter((slot) => !bookingForSlot(slot.id))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  function updateMaster(key, value) {
    setState((prev) => ({ ...prev, master: { ...prev.master, [key]: value } }));
  }

  function addService(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name")).trim();
    const price = Number(data.get("price"));
    const duration = Number(data.get("duration"));
    if (!name || !price || !duration) return showToast("Заполни услугу полностью");
    setState((prev) => ({
      ...prev,
      services: [...prev.services, { id: makeId(), name, price, duration }],
    }));
    e.currentTarget.reset();
    showToast("Услуга добавлена");
  }

  function addSlot(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const serviceId = String(data.get("serviceId"));
    const date = String(data.get("date"));
    const time = String(data.get("time"));
    if (!serviceId || !date || !time) return showToast("Заполни окошко полностью");
    setState((prev) => ({
      ...prev,
      slots: [...prev.slots, { id: makeId(), serviceId, date, time, hot: false }],
    }));
    e.currentTarget.reset();
    setScreen("public");
    showToast("Окошко опубликовано");
  }

  function createBooking() {
    const slot = slotById(selectedSlotId);
    if (!slot) return;
    if (!bookingForm.name.trim() || !bookingForm.contact.trim()) return showToast("Введи имя и контакт");
    if (bookingForSlot(slot.id)) return showToast("Окошко уже занято");

    const contact = bookingForm.contact.trim();
    let clientId = makeId();

    setState((prev) => {
      const existingClient = prev.clients.find((c) => c.contact.toLowerCase() === contact.toLowerCase());
      let clients = prev.clients;

      if (existingClient) {
        clientId = existingClient.id;
        clients = prev.clients.map((c) =>
          c.id === existingClient.id
            ? { ...c, name: bookingForm.name.trim(), visits: c.visits + 1, lastVisitAt: new Date().toISOString(), note: bookingForm.note || c.note }
            : c
        );
      } else {
        clients = [
          ...prev.clients,
          {
            id: clientId,
            name: bookingForm.name.trim(),
            contact,
            visits: 1,
            note: bookingForm.note,
            createdAt: new Date().toISOString(),
            lastVisitAt: new Date().toISOString(),
          },
        ];
      }

      return {
        ...prev,
        clients,
        bookings: [
          ...prev.bookings,
          {
            id: makeId(),
            slotId: slot.id,
            clientId,
            clientName: bookingForm.name.trim(),
            clientContact: contact,
            note: bookingForm.note,
            status: "active",
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });

    setSelectedSlotId(null);
    setBookingForm({ name: "", contact: "", note: "" });
    setScreen("bookings");
    showToast("Клиент записан");
  }

  function cancelBooking(id) {
    setState((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)),
      slots: prev.slots.map((s) => (s.id === prev.bookings.find((b) => b.id === id)?.slotId ? { ...s, hot: true } : s)),
    }));
    showToast("Запись отменена, окошко снова свободно");
  }

  function deleteSlot(id) {
    if (bookingForSlot(id)) return showToast("Нельзя удалить занятое окошко");
    setState((prev) => ({ ...prev, slots: prev.slots.filter((s) => s.id !== id) }));
    showToast("Окошко удалено");
  }

  function makeHot(id) {
    setState((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, hot: !s.hot } : s)),
    }));
  }

  async function copyLink() {
    const text = `https://okoshki.app/${state.master.slug || "master"}`;
    await navigator.clipboard?.writeText(text);
    showToast("Ссылка скопирована");
  }

  async function hotPost() {
    const slot = freeSlots[0];
    if (!slot) return showToast("Нет свободных окошек");
    const service = serviceById(slot.serviceId);
    const text = `⚡ Освободилось окошко!\n\n${service.name}\n${dateHuman(slot.date)} в ${slot.time}\n${money(service.price)}\n\nЗапись: https://okoshki.app/${state.master.slug}`;
    await navigator.clipboard?.writeText(text);
    makeHot(slot.id);
    showToast("Пост скопирован");
  }

  return (
    <div className="app">
      <header className="top glass">
        <div>
          <p className="label">Telegram Mini App</p>
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
              <BookingMini booking={nextBooking.booking} slot={nextBooking.slot} service={serviceById(nextBooking.slot.serviceId)} />
            ) : (
              <p className="muted last">Записей пока нет. Открой страницу клиента и сделай тест.</p>
            )}
          </Card>

          <Card title="Фокус продукта">
            <p className="muted last">Окошки — это не CRM ради CRM. Это инструмент, который помогает мастеру быстро заполнить свободное время и не потерять клиентов.</p>
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
              <SlotCard key={slot.id} slot={slot} service={serviceById(slot.serviceId)} onBook={() => setSelectedSlotId(slot.id)} />
            )) : <Empty text="Свободных окошек пока нет." />}
          </div>
        </main>
      )}

      {screen === "master" && (
        <main className="screen">
          <Card title="Профиль">
            <div className="form">
              <Input label="Имя мастера / студии" value={state.master.name} onChange={(v) => updateMaster("name", v)} />
              <Input label="Описание" value={state.master.about} onChange={(v) => updateMaster("about", v)} />
              <Input label="Ссылка" value={state.master.slug} onChange={(v) => updateMaster("slug", v.replaceAll(" ", "_").toLowerCase())} />
              <Input label="Эмодзи" value={state.master.emoji} onChange={(v) => updateMaster("emoji", v)} />
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
              <select name="serviceId">
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
                <AdminSlot key={slot.id} slot={slot} service={serviceById(slot.serviceId)} booked={bookingForSlot(slot.id)} onHot={() => makeHot(slot.id)} onDelete={() => deleteSlot(slot.id)} />
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
                const slot = slotById(b.slotId);
                return <BookingCard key={b.id} booking={b} slot={slot} service={serviceById(slot?.serviceId)} onCancel={() => cancelBooking(b.id)} />;
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
              const service = serviceById(slot?.serviceId);
              return `${service?.name} · ${dateHuman(slot?.date)} · ${slot?.time} · ${money(service?.price)}`;
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
        <button className="reset" onClick={() => { localStorage.removeItem("okoshki_real_mvp"); setState(starter); showToast("Демо сброшено"); }}>Сбросить демо</button>
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
          <span className="pill">📅 {dateHuman(slot.date)}</span>
          <span className="pill">⏰ {slot.time}</span>
          <span className="pill">{money(service?.price)}</span>
          {slot.hot && <span className="pill hot">⚡ горит</span>}
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
        <span className="pill">📅 {dateHuman(slot.date)}</span>
        <span className="pill">⏰ {slot.time}</span>
        <span className="pill">{booked ? "занято" : "свободно"}</span>
        {slot.hot && <span className="pill hot">⚡ горит</span>}
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
      <h4>{booking.clientName}</h4>
      <p className="muted">{booking.clientContact}</p>
      <div className="row">
        <span className="pill">{service?.name}</span>
        <span className="pill">{dateHuman(slot.date)}</span>
        <span className="pill">{slot.time}</span>
      </div>
    </div>
  );
}

function BookingCard({ booking, slot, service, onCancel }) {
  return (
    <div className="item">
      <h4>💬 {booking.clientName}</h4>
      <p className="muted">{booking.clientContact}{booking.note ? ` · ${booking.note}` : ""}</p>
      <div className="row">
        <span className="pill">{service?.name}</span>
        <span className="pill">📅 {dateHuman(slot.date)}</span>
        <span className="pill">⏰ {slot.time}</span>
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
