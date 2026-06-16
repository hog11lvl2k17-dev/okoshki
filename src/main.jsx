import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import WebApp from "@twa-dev/sdk";
import { CalendarDays, Users, Plus, Link, Home } from "lucide-react";
import { supabase, hasSupabaseConfig } from "./lib/supabase";
import "./styles.css";

const DEFAULT_MASTER_SLUG = "anna_okoshki";
const STORAGE_BUCKET = "master-uploads";
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

function makeSlug(text) {
  const base = String(text || "master")
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  return `${base || "master"}_${Math.floor(Math.random() * 100000)}`;
}

function getTelegramUser() {
  try {
    const user = WebApp?.initDataUnsafe?.user;

    if (user?.id) {
      return {
        id: String(user.id),
        username: user.username || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
      };
    }
  } catch {}

  return null;
}

function telegramContact(user) {
  if (!user) return "";
  return user.username ? `@${user.username}` : user.first_name || "";
}

function safeFileName(name) {
  return String(name || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё._-]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function slotSort(a, b) {
  return `${a.slot_date || ""} ${a.slot_time || ""}`.localeCompare(`${b.slot_date || ""} ${b.slot_time || ""}`);
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
    contact: "@anna_okoshki",
    avatar_url: "",
    cover_url: "",
    telegram_id: "",
  },
  services: demoServices,
  slots: [
    { id: makeId(), service_id: demoServices[0].id, slot_date: todayISO, slot_time: "15:00", is_hot: false, is_active: true },
  ],
  bookings: [],
  clients: [],
  reviews: [],
  photos: [
    {
      id: "demo-work-1",
      master_id: "local-master",
      image_url: "",
      title: "Пример работы",
      description: "Здесь мастер сможет публиковать свои работы как мини-ленту.",
      created_at: new Date().toISOString(),
    },
  ],
};

const demoCategories = [
  { id: "all", slug: "all", name: "Все", emoji: "✨" },
  { id: "manicure", slug: "manicure", name: "Маникюр", emoji: "💅" },
  { id: "lashes", slug: "lashes", name: "Ресницы", emoji: "👁️" },
  { id: "brows", slug: "brows", name: "Брови", emoji: "🤨" },
  { id: "barber", slug: "barber", name: "Барбер", emoji: "💈" },
  { id: "tattoo", slug: "tattoo", name: "Тату", emoji: "🖋️" },
  { id: "massage", slug: "massage", name: "Массаж", emoji: "💆" },
  { id: "cosmetology", slug: "cosmetology", name: "Косметология", emoji: "🧴" },
];

function App() {
  const [mode, setMode] = useState(hasSupabaseConfig ? "supabase" : "local");
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [screen, setScreen] = useState("market");
  const [masterView, setMasterView] = useState("overview");
  const [publicTab, setPublicTab] = useState("slots");
  const [state, setState] = useState(demoState);
  const [masters, setMasters] = useState([demoState.master]);
  const [categories, setCategories] = useState(demoCategories);
  const [city, setCity] = useState("Красноярск");
  const [category, setCategory] = useState("all");
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [bookingForm, setBookingForm] = useState({ name: "", contact: "", note: "" });
  const [toast, setToast] = useState("");
  const [role, setRole] = useState("client");
  const [telegramUser, setTelegramUser] = useState(() => getTelegramUser());
  const [masterAccount, setMasterAccount] = useState(null);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);
  const [lastBooking, setLastBooking] = useState(null);
  const [masterForm, setMasterForm] = useState({
    name: "",
    city: "Красноярск",
    category: "manicure",
    about: "",
    contact: telegramContact(getTelegramUser()),
  });
  const [isMasterCreating, setIsMasterCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    client_name: "",
    rating: "5",
    text: "",
  });
  const bookingLock = useRef(false);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {}

    const user = getTelegramUser();
    if (user) {
      setTelegramUser(user);
      setBookingForm((p) => ({ ...p, contact: p.contact || telegramContact(user) }));
      setMasterForm((p) => ({ ...p, contact: p.contact || telegramContact(user) }));
    }
  }, []);

  useEffect(() => {
    if (role === "client" && ["master", "bookings", "clients", "master-services", "master-slots", "master-profile"].includes(screen)) {
      setScreen("market");
    }
  }, [role, screen]);

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
      const currentTgUser = getTelegramUser() || telegramUser;

      if (currentTgUser) {
        setTelegramUser(currentTgUser);
      }

      const [{ data: cats }, { data: masterList }] = await Promise.all([
        supabase.from("categories").select("id,slug,name,emoji").order("name"),
        supabase
          .from("masters")
          .select("id,slug,name,about,city,category,emoji,avatar_url,cover_url,rating,reviews_count,is_pro,is_visible,telegram_id")
          .eq("is_visible", true)
          .order("rating", { ascending: false }),
      ]);

      const list = masterList || [];
      const params = new URLSearchParams(window.location.search);
      const slugFromLink = params.get("master");

      if (cats?.length) {
        setCategories([{ id: "all", slug: "all", name: "Все", emoji: "✨" }, ...cats]);
      }

      setMasters(list);

      const ownMaster = currentTgUser?.id
        ? list.find((m) => String(m.telegram_id || "") === currentTgUser.id)
        : null;

      if (ownMaster) {
        setMasterAccount(ownMaster);
      } else {
        setMasterAccount(null);
      }

      if (slugFromLink) {
        setRole("client");
        setScreen("public");
        setCity(list.find((m) => m.slug === slugFromLink)?.city || list[0]?.city || "Красноярск");
        await loadMaster(slugFromLink, true);
      } else if (ownMaster) {
        setRole("master");
        setMasterView("overview");
        setScreen("master");
        setCity(ownMaster.city || list[0]?.city || "Красноярск");
        await loadMaster(ownMaster.slug, false);
      } else {
        setRole("client");
        setScreen("market");
        setCity(list[0]?.city || "Красноярск");
        // Важно: обычному клиенту на старте не грузим профиль первого мастера.
        // Он загрузится только после нажатия на карточку мастера.
      }

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
    if (openProfile) {
      setProfileLoading(true);
      setScreen("public");
    }

    if (!hasSupabaseConfig) {
      setState(demoState);
      if (openProfile) setScreen("public");
      setProfileLoading(false);
      return;
    }

    const { data: master, error: masterError } = await supabase
      .from("masters")
      .select("*")
      .eq("slug", slug)
      .single();

    if (masterError) throw masterError;

    const isOwnMaster = telegramUser?.id && String(master.telegram_id || "") === telegramUser.id;

    const [
      { data: services },
      { data: slots },
      { data: bookings },
      clientsResult,
      { data: reviews },
      { data: photos },
    ] = await Promise.all([
      supabase.from("services").select("*").eq("master_id", master.id).order("created_at"),
      supabase.from("slots").select("*").eq("master_id", master.id).eq("is_active", true).order("slot_date").order("slot_time"),
      supabase.from("bookings").select("*").eq("master_id", master.id).neq("status", "cancelled").order("created_at", { ascending: false }),
      isOwnMaster
        ? supabase.from("clients").select("*").eq("master_id", master.id).order("last_visit_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from("reviews").select("*").eq("master_id", master.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("master_photos").select("*").eq("master_id", master.id).order("created_at", { ascending: false }).limit(30),
    ]);

    const clients = clientsResult?.data || [];

    setState({
      master,
      services: services || [],
      slots: (slots || []).sort(slotSort),
      bookings: bookings || [],
      clients: clients || [],
      reviews: reviews || [],
      photos: photos || [],
    });

    if (telegramUser?.id && String(master.telegram_id || "") === telegramUser.id) {
      setMasterAccount(master);
    }

    if (openProfile) setScreen("public");
    setProfileLoading(false);
  }

  async function openOwnMasterCabinet(master = masterAccount) {
    if (!master) {
      setRole("client");
      setScreen("become-master");
      return;
    }

    setRole("master");
    setMasterView("overview");
    setScreen("master");
    await loadMaster(master.slug, false);
  }

  const activeBookings = state.bookings.filter((b) => b.status !== "cancelled");
  const freeSlots = state.slots.filter((s) => s.is_active !== false && !bookingForSlot(s.id)).sort(slotSort);
  const busySlots = state.slots.filter((s) => s.is_active !== false && bookingForSlot(s.id)).sort(slotSort);
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

  const setupSteps = [
    { done: Boolean(state.master.name && state.master.about), title: "Заполнить профиль" },
    { done: state.services.length > 0, title: "Добавить хотя бы одну услугу" },
    { done: freeSlots.length > 0, title: "Опубликовать свободное окошко" },
    { done: Boolean(state.master.contact), title: "Указать контакт для клиентов" },
    { done: (state.photos || []).length > 0, title: "Добавить пример работы" },
  ];
  const setupProgress = setupSteps.filter((s) => s.done).length;



  async function uploadFile(file, folder = "works") {
    if (!file) return "";

    if (mode !== "supabase") {
      showToast("Загрузка фото работает только с Supabase");
      return "";
    }

    const ext = file.name?.split(".").pop() || "jpg";
    const path = `${state.master.id}/${folder}/${Date.now()}-${safeFileName(file.name || `photo.${ext}`)}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async function handleMasterImageUpload(e, field, folder) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const url = await uploadFile(file, folder);
      if (url) {
        await updateMaster(field, url);
        showToast(field === "avatar_url" ? "Аватарка загружена" : "Обложка загружена");
      }
    } catch (error) {
      console.error(error);
      showToast("Не загрузил фото. Проверь Storage SQL.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  async function deleteWork(workId) {
    const ok = window.confirm("Удалить эту работу из профиля?");
    if (!ok) return;

    if (mode === "supabase") {
      const { error } = await supabase
        .from("master_photos")
        .delete()
        .eq("id", workId)
        .eq("master_id", state.master.id);

      if (error) return showToast("Не удалил работу: " + error.message);
    }

    setState((p) => ({
      ...p,
      photos: (p.photos || []).filter((photo) => photo.id !== workId),
    }));

    showToast("Работа удалена");
  }

  async function addReview(e) {
    e.preventDefault();

    const name = reviewForm.client_name.trim();
    const rating = Number(reviewForm.rating || 5);
    const text = reviewForm.text.trim();

    if (!name || !text) {
      return showToast("Введи имя и текст отзыва");
    }

    try {
      let review;

      if (mode === "supabase") {
        const { data, error } = await supabase
          .from("reviews")
          .insert({
            master_id: state.master.id,
            client_name: name,
            rating,
            text,
          })
          .select()
          .single();

        if (error) throw error;
        review = data;
      } else {
        review = {
          id: makeId(),
          master_id: state.master.id,
          client_name: name,
          rating,
          text,
          created_at: new Date().toISOString(),
        };
      }

      const nextReviews = [review, ...(state.reviews || [])];
      const nextCount = nextReviews.length;
      const nextRating = nextReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / Math.max(nextCount, 1);

      setState((p) => ({
        ...p,
        reviews: nextReviews,
        master: {
          ...p.master,
          reviews_count: nextCount,
          rating: Number(nextRating.toFixed(1)),
        },
      }));

      setMasters((p) => p.map((m) => (
        m.id === state.master.id
          ? { ...m, reviews_count: nextCount, rating: Number(nextRating.toFixed(1)) }
          : m
      )));

      if (mode === "supabase") {
        await supabase
          .from("masters")
          .update({
            reviews_count: nextCount,
            rating: Number(nextRating.toFixed(1)),
          })
          .eq("id", state.master.id);
      }

      setReviewForm({ client_name: "", rating: "5", text: "" });
      showToast("Отзыв добавлен");
    } catch (error) {
      console.error(error);
      showToast("Не добавил отзыв. Проверь SQL таблицы reviews.");
    }
  }

  async function addWork(e) {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    let image_url = String(fd.get("image_url") || "").trim();
    const file = fd.get("photo");
    const title = String(fd.get("title") || "").trim();
    const description = String(fd.get("description") || "").trim();

    if (file && file.size) {
      setIsUploading(true);
      try {
        image_url = await uploadFile(file, "works");
      } finally {
        setIsUploading(false);
      }
    }

    if (!image_url && !title && !description) {
      return showToast("Добавь фото, название или описание работы");
    }

    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("master_photos")
        .insert({
          master_id: state.master.id,
          image_url,
          title: title || "Моя работа",
          description,
        })
        .select()
        .single();

      if (error) return showToast("Не добавил работу: " + error.message);
      setState((p) => ({ ...p, photos: [data, ...(p.photos || [])] }));
    } else {
      setState((p) => ({
        ...p,
        photos: [
          {
            id: makeId(),
            master_id: state.master.id,
            image_url,
            title: title || "Моя работа",
            description,
            created_at: new Date().toISOString(),
          },
          ...(p.photos || []),
        ],
      }));
    }

    e.currentTarget.reset();
    setMasterView("works");
    showToast("Работа добавлена");
  }

  async function updateMaster(key, value) {
    const nextMaster = { ...state.master, [key]: value };

    setState((p) => ({ ...p, master: nextMaster }));
    setMasters((p) => p.map((m) => (m.id === nextMaster.id ? { ...m, [key]: value } : m)));
    if (masterAccount?.id === nextMaster.id) setMasterAccount(nextMaster);

    if (mode === "supabase") {
      const { error } = await supabase.from("masters").update({ [key]: value }).eq("id", state.master.id);
      if (error) showToast("Не сохранил профиль: " + error.message);
    }
  }

  async function toggleVisibility() {
    await updateMaster("is_visible", !state.master.is_visible);
    showToast(state.master.is_visible ? "Профиль скрыт" : "Профиль опубликован");
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
    } else {
      setState((p) => ({
        ...p,
        services: [...p.services, { id: makeId(), name, price, duration }],
      }));
    }

    e.currentTarget.reset();
    setMasterView("services");
    showToast("Услуга добавлена");
  }

  async function addSlot(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const service_id = String(fd.get("service_id"));
    const slot_date = String(fd.get("date"));
    const slot_time = String(fd.get("time"));

    if (!service_id || !slot_date || !slot_time) return showToast("Заполни дату и время");
    if (!state.services.length) return showToast("Сначала добавь услугу");

    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("slots")
        .insert({ master_id: state.master.id, service_id, slot_date, slot_time, is_hot: false, is_active: true })
        .select()
        .single();

      if (error) return showToast("Ошибка: " + error.message);
      setState((p) => ({ ...p, slots: [...p.slots, data].sort(slotSort) }));
    } else {
      setState((p) => ({
        ...p,
        slots: [...p.slots, { id: makeId(), service_id, slot_date, slot_time, is_hot: false, is_active: true }].sort(slotSort),
      }));
    }

    e.currentTarget.reset();
    setMasterView("slots");
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

  async function sendTelegramNotification({ booking, slot, service }) {
    try {
      await fetch("/api/notify-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          masterTelegramId: state.master.telegram_id || "",
          masterName: state.master.name,
          clientName: booking.client_name,
          clientContact: booking.client_contact,
          serviceName: service?.name || "Услуга",
          slotDate: dateHuman(slot?.slot_date),
          slotTime: normalizeTime(slot?.slot_time),
          price: money(service?.price),
          note: booking.note || "",
          appUrl: window.location.origin,
        }),
      });
    } catch (error) {
      console.warn("Telegram notification failed:", error);
    }
  }

  async function createBooking() {
    if (bookingLock.current) return;

    const slot = slotById(selectedSlotId);
    if (!slot) return;
    if (!bookingForm.name.trim() || !bookingForm.contact.trim()) return showToast("Введи имя и контакт");

    if (bookingForSlot(slot.id)) {
      setSelectedSlotId(null);
      return showToast("Это окошко уже занято. Выбери другое.");
    }

    bookingLock.current = true;
    setIsBookingSubmitting(true);

    try {
      const name = bookingForm.name.trim();
      const contact = bookingForm.contact.trim();
      const note = bookingForm.note.trim();
      const client = await upsertClient(name, contact, note);

      let data;

      if (mode === "supabase") {
        const result = await supabase
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

        if (result.error) {
          const isDuplicateSlot =
            result.error.code === "23505" ||
            String(result.error.message || "").includes("one_active_booking_per_slot") ||
            String(result.error.details || "").includes("already exists");

          if (isDuplicateSlot) {
            setSelectedSlotId(null);
            showToast("Это окошко уже занято. Выбери другое.");
            return;
          }

          throw result.error;
        }

        data = result.data;
      } else {
        data = {
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

      setState((p) => ({
        ...p,
        bookings: [data, ...p.bookings],
        clients: p.clients.find((c) => c.id === client.id)
          ? p.clients.map((c) => (c.id === client.id ? client : c))
          : [client, ...p.clients],
      }));

      if (mode === "supabase") {
        await sendTelegramNotification({
          booking: data,
          slot,
          service: serviceById(slot.service_id),
        });
      }

      setLastBooking({
        booking: data,
        slot,
        service: serviceById(slot.service_id),
      });

      setSelectedSlotId(null);
      setBookingForm({ name: "", contact: telegramContact(telegramUser), note: "" });
      setScreen(role === "master" ? "master" : "success");
      setMasterView("bookings");
      showToast("Вы записаны");
    } catch (e) {
      console.error(e);
      showToast("Ошибка записи. Попробуй ещё раз.");
    } finally {
      bookingLock.current = false;
      setIsBookingSubmitting(false);
    }
  }

  async function createMasterProfile(e) {
    e.preventDefault();

    const tgUser = telegramUser || getTelegramUser();

    if (!tgUser?.id) {
      return showToast("Открой мини-апку через Telegram, чтобы привязать кабинет");
    }

    const name = masterForm.name.trim();
    const cityValue = masterForm.city.trim();
    const about = masterForm.about.trim();
    const contact = masterForm.contact.trim() || telegramContact(tgUser);
    const categoryValue = masterForm.category || "manicure";

    if (!name || !cityValue || !about) {
      return showToast("Заполни имя, город и описание");
    }

    setIsMasterCreating(true);

    try {
      if (mode === "supabase") {
        const { data: existing, error: existingError } = await supabase
          .from("masters")
          .select("*")
          .eq("telegram_id", tgUser.id)
          .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
          setMasterAccount(existing);
          await openOwnMasterCabinet(existing);
          showToast("Кабинет мастера открыт");
          return;
        }

        const { data, error } = await supabase
          .from("masters")
          .insert({
            name,
            city: cityValue,
            category: categoryValue,
            about,
            contact,
            avatar_url: "",
            cover_url: "",
            slug: makeSlug(name),
            emoji: "✨",
            rating: 5,
            reviews_count: 0,
            is_visible: true,
            is_pro: false,
            telegram_id: tgUser.id,
            telegram_username: tgUser.username || "",
            telegram_first_name: tgUser.first_name || "",
          })
          .select()
          .single();

        if (error) throw error;

        setMasterAccount(data);
        setMasters((p) => [data, ...p.filter((m) => m.id !== data.id)]);
        setRole("master");
        setScreen("master");
        setMasterView("overview");
        await loadMaster(data.slug, false);
      } else {
        const data = {
          id: makeId(),
          name,
          city: cityValue,
          category: categoryValue,
          about,
          contact,
          avatar_url: "",
          cover_url: "",
          slug: makeSlug(name),
          emoji: "✨",
          rating: 5,
          reviews_count: 0,
          is_visible: true,
          is_pro: false,
          telegram_id: tgUser.id,
          telegram_username: tgUser.username || "",
          telegram_first_name: tgUser.first_name || "",
        };

        setMasterAccount(data);
        setMasters((p) => [data, ...p.filter((m) => m.id !== data.id)]);
        setState({ master: data, services: [], slots: [], bookings: [], clients: [], reviews: [], photos: [] });
        setRole("master");
        setScreen("master");
        setMasterView("overview");
      }

      showToast("Профиль мастера создан");
    } catch (e) {
      console.error(e);
      showToast("Не создал профиль. Проверь SQL-обновление в Supabase.");
    } finally {
      setIsMasterCreating(false);
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

    showToast("Запись отменена");
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
          <p className="label">{role === "master" ? "Кабинет мастера" : "Маркетплейс услуг"}</p>
          <h1>Окошки</h1>
          <p className="sub">
            {role === "master"
              ? "Услуги, свободное время, записи и клиенты в одном месте."
              : "Выбери мастера и свободное окошко без долгой переписки."}
          </p>
        </div>
        <div className="logo">🪟</div>
      </header>

      {role === "master" && (
        <MasterShell
          master={state.master}
          masterView={masterView}
          setMasterView={setMasterView}
          setRole={setRole}
          setScreen={setScreen}
        />
      )}

      {role === "client" && screen === "market" && (
        <main className="screen">
          <Card title="Что ищем?">
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

          <div className="sectionTitle">
            <h3>Мастера</h3>
            <span>{filteredMasters.length}</span>
          </div>

          <div className="cards">
            {filteredMasters.length ? filteredMasters.map((m) => (
              <div className="item slotCard masterCard" key={m.id}>
                <Avatar master={m} />
                <div className="masterCardBody">
                  <h4>{m.name} {m.is_pro ? "👑" : ""}</h4>
                  <p className="muted">{m.city} · ⭐ {Number(m.rating || 5).toFixed(1)} · {m.reviews_count || 0} отзывов</p>
                  <p className="muted last">{m.about || "Мастер принимает записи через Окошки"}</p>
                </div>
                <button className="book" onClick={() => { setPublicTab("slots"); loadMaster(m.slug, true); }}>Профиль</button>
              </div>
            )) : <Empty text="В этом городе пока нет мастеров." />}
          </div>

          <Card title={masterAccount ? "Ты уже мастер" : "Хочешь принимать записи?"}>
            <p className="muted">
              {masterAccount
                ? "Открой свой кабинет, чтобы добавить услуги, окошки и посмотреть записи."
                : "Зарегистрируйся как мастер и добавляй свободные окошки для клиентов."}
            </p>
            <button className="primary" onClick={() => masterAccount ? openOwnMasterCabinet() : setScreen("become-master")}>
              {masterAccount ? "Открыть кабинет мастера" : "Стать мастером"}
            </button>
          </Card>
        </main>
      )}

      {screen === "public" && (
        <main className="screen">
          {profileLoading && <Card title="Загружаем профиль"><p className="muted last">Подтягиваем услуги, окошки и работы мастера...</p></Card>}
          <div className="profile glass profileCover" style={state.master.cover_url ? { backgroundImage: `linear-gradient(180deg, rgba(25,18,18,.22), rgba(25,18,18,.72)), url(${state.master.cover_url})` } : undefined}>
            <Avatar master={state.master} big />
            <div>
              <p className="muted">Профиль мастера · {state.master.city}</p>
              <h2>{state.master.name}</h2>
              <p>{state.master.about}</p>
              <p className="linkText">⭐ {Number(state.master.rating || 5).toFixed(1)} · {state.master.reviews_count || 0} отзывов</p>
            </div>
          </div>

          <div className="publicTabs">
            <button className={publicTab === "slots" ? "publicTab active" : "publicTab"} onClick={() => setPublicTab("slots")}>Окошки</button>
            <button className={publicTab === "works" ? "publicTab active" : "publicTab"} onClick={() => setPublicTab("works")}>Работы</button>
            <button className={publicTab === "reviews" ? "publicTab active" : "publicTab"} onClick={() => setPublicTab("reviews")}>Отзывы</button>
          </div>

          {publicTab === "slots" && (
            <>
              <h3>Услуги</h3>
              <div className="chips">
                {state.services.length
                  ? state.services.map((s) => <span className="chip" key={s.id}>{s.name} · {money(s.price)}</span>)
                  : <span className="chip">Услуги пока не добавлены</span>}
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
            </>
          )}

          {publicTab === "works" && (
            <>
              <h3>Примеры работ</h3>
              <div className="feed">
                {state.photos?.length ? state.photos.map((p) => (
                  <WorkPost work={p} key={p.id} />
                )) : <Empty text="Мастер пока не добавил работы." />}
              </div>
            </>
          )}

          {publicTab === "reviews" && (
            <>
              <Card title="Оставить отзыв">
                <form className="form" onSubmit={addReview}>
                  <input
                    placeholder="Ваше имя"
                    value={reviewForm.client_name}
                    onChange={(e) => setReviewForm({ ...reviewForm, client_name: e.target.value })}
                  />
                  <label>
                    Оценка
                    <select
                      value={reviewForm.rating}
                      onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
                    >
                      <option value="5">5 — отлично</option>
                      <option value="4">4 — хорошо</option>
                      <option value="3">3 — нормально</option>
                      <option value="2">2 — плохо</option>
                      <option value="1">1 — ужасно</option>
                    </select>
                  </label>
                  <input
                    placeholder="Напишите отзыв"
                    value={reviewForm.text}
                    onChange={(e) => setReviewForm({ ...reviewForm, text: e.target.value })}
                  />
                  <button className="primary">Опубликовать отзыв</button>
                </form>
              </Card>

              <h3>Отзывы</h3>
              <div className="cards">
                {state.reviews?.length ? state.reviews.map((r) => (
                  <div className="item" key={r.id}>
                    <h4>⭐ {r.rating} · {r.client_name}</h4>
                    <p className="muted last">{r.text || "Без текста"}</p>
                  </div>
                )) : <Empty text="Пока отзывов нет." />}
              </div>
            </>
          )}

          <button className="reset" onClick={() => setScreen("market")}>Назад к каталогу</button>
        </main>
      )}

      {screen === "become-master" && role === "client" && (
        <main className="screen">
          <Card title="Стать мастером">
            <p className="muted">
              Создай профиль, добавь услуги и свободные окошки. Кабинет привяжется к твоему Telegram-аккаунту.
            </p>

            {telegramUser ? (
              <div className="item">
                <h4>Telegram привязан</h4>
                <p className="muted last">
                  {telegramUser.username ? `@${telegramUser.username}` : telegramUser.first_name} · ID {telegramUser.id}
                </p>
              </div>
            ) : (
              <div className="item">
                <h4>Открой через Telegram</h4>
                <p className="muted last">
                  Для регистрации мастера нужен Telegram ID. В обычном браузере кабинет не привяжется.
                </p>
              </div>
            )}

            <form className="form" onSubmit={createMasterProfile}>
              <input
                placeholder="Имя мастера или студии"
                value={masterForm.name}
                onChange={(e) => setMasterForm({ ...masterForm, name: e.target.value })}
              />

              <input
                placeholder="Город"
                value={masterForm.city}
                onChange={(e) => setMasterForm({ ...masterForm, city: e.target.value })}
              />

              <label>
                Категория
                <select
                  value={masterForm.category}
                  onChange={(e) => setMasterForm({ ...masterForm, category: e.target.value })}
                >
                  {categories.filter((c) => c.slug !== "all").map((c) => (
                    <option value={c.slug} key={c.slug}>{c.emoji} {c.name}</option>
                  ))}
                </select>
              </label>

              <input
                placeholder="Коротко о себе: маникюр, брови, барбер..."
                value={masterForm.about}
                onChange={(e) => setMasterForm({ ...masterForm, about: e.target.value })}
              />

              <input
                placeholder="Контакт для связи, например @username"
                value={masterForm.contact}
                onChange={(e) => setMasterForm({ ...masterForm, contact: e.target.value })}
              />

              <button className="primary" disabled={isMasterCreating || !telegramUser}>
                {isMasterCreating ? "Создаём..." : "Зарегистрироваться как мастер"}
              </button>
            </form>

            <button className="reset" onClick={() => setScreen("market")}>Назад к каталогу</button>
          </Card>
        </main>
      )}

      {screen === "success" && (
        <main className="screen">
          <Card title="Вы записаны">
            {lastBooking ? (
              <div className="item">
                <h4>✅ Запись создана</h4>
                <p className="muted">
                  {lastBooking.service?.name} · {dateHuman(lastBooking.slot?.slot_date)} · {normalizeTime(lastBooking.slot?.slot_time)} · {money(lastBooking.service?.price)}
                </p>
                <p className="muted last">
                  Мастер получил уведомление в Telegram. Если нужно что-то изменить — напишите мастеру по контакту.
                </p>
              </div>
            ) : (
              <Empty text="Запись создана." />
            )}
            <button className="primary" onClick={() => { setRole("client"); setScreen("market"); }}>Вернуться к мастерам</button>
          </Card>
        </main>
      )}

      {screen === "master" && role === "master" && (
        <main className="screen masterScreen">
          {masterView === "overview" && (
            <>
              <section className="stats">
                <Stat title="Сегодня" value={todayBookings.length} sub="записей" />
                <Stat title="Доход" value={money(todayIncome)} sub="сегодня" />
                <Stat title="Свободно" value={freeSlots.length} sub="окошек" />
              </section>

              <Card title="Что сейчас важно">
                <div className="progressLine">
                  <div style={{ width: `${(setupProgress / setupSteps.length) * 100}%` }} />
                </div>
                <p className="muted">Готовность кабинета: {setupProgress} из {setupSteps.length}</p>

                <div className="checkList">
                  {setupSteps.map((step) => (
                    <div className={step.done ? "check done" : "check"} key={step.title}>
                      <span>{step.done ? "✅" : "○"}</span>
                      <p>{step.title}</p>
                    </div>
                  ))}
                </div>

                <div className="quickGrid">
                  <button className="primary" onClick={() => setMasterView("slots")}>Добавить окошко</button>
                  <button className="secondary" onClick={() => setMasterView("works")}>Добавить работу</button>
                </div>
              </Card>

              <Card title="Ближайшие записи">
                <div className="cards">
                  {activeBookings.slice(0, 3).length ? activeBookings.slice(0, 3).map((b) => {
                    const slot = slotById(b.slot_id);
                    const service = serviceById(slot?.service_id);
                    return (
                      <div className="item" key={b.id}>
                        <h4>💬 {b.client_name}</h4>
                        <p className="muted">{service?.name} · {dateHuman(slot?.slot_date)} · {normalizeTime(slot?.slot_time)}</p>
                        <p className="muted last">{b.client_contact}</p>
                      </div>
                    );
                  }) : <Empty text="Пока нет записей. Опубликуй окошко и поделись профилем." />}
                </div>
              </Card>

              <Card title="Подписка">
                <div className="item">
                  <h4>Trial / тестовый режим</h4>
                  <p className="muted last">Оплату пока не включаем. Здесь позже будет тариф, остаток дней и кнопка продления.</p>
                </div>
              </Card>
            </>
          )}

          {masterView === "services" && (
            <>
              <Card title="Мои услуги">
                <div className="cards">
                  {state.services.length ? state.services.map((s) => (
                    <div className="item slotCard" key={s.id}>
                      <div>
                        <h4>{s.name}</h4>
                        <p className="muted last">{money(s.price)} · {s.duration} мин.</p>
                      </div>
                    </div>
                  )) : <Empty text="Услуг пока нет. Добавь первую услугу ниже." />}
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
            </>
          )}

          {masterView === "slots" && (
            <>
              <Card title="Опубликовать окошко">
                <form className="form" onSubmit={addSlot}>
                  <select name="service_id" disabled={!state.services.length}>
                    {state.services.length
                      ? state.services.map((s) => <option value={s.id} key={s.id}>{s.name} · {money(s.price)}</option>)
                      : <option>Сначала добавь услугу</option>}
                  </select>
                  <div className="two">
                    <input name="date" type="date" defaultValue={todayISO} />
                    <input name="time" type="time" />
                  </div>
                  <button className="primary" disabled={!state.services.length}>Опубликовать</button>
                </form>
              </Card>

              <Card title="Свободные окошки">
                <div className="cards">
                  {freeSlots.length ? freeSlots.map((slot) => (
                    <div className="item slotCard" key={slot.id}>
                      <div>
                        <h4>{serviceById(slot.service_id)?.name}</h4>
                        <p className="muted last">{dateHuman(slot.slot_date)} · {normalizeTime(slot.slot_time)} · {money(serviceById(slot.service_id)?.price)}</p>
                      </div>
                      <span className="status ok">свободно</span>
                    </div>
                  )) : <Empty text="Нет свободных окошек." />}
                </div>
              </Card>

              <Card title="Занятые окошки">
                <div className="cards">
                  {busySlots.length ? busySlots.map((slot) => (
                    <div className="item slotCard" key={slot.id}>
                      <div>
                        <h4>{serviceById(slot.service_id)?.name}</h4>
                        <p className="muted last">{dateHuman(slot.slot_date)} · {normalizeTime(slot.slot_time)}</p>
                      </div>
                      <span className="status busy">занято</span>
                    </div>
                  )) : <Empty text="Пока нет занятых окошек." />}
                </div>
              </Card>
            </>
          )}


          {masterView === "works" && (
            <>
              <Card title="Мои работы">
                <div className="feed">
                  {state.photos?.length ? state.photos.map((p) => (
                    <WorkPost work={p} key={p.id} canDelete onDelete={() => deleteWork(p.id)} />
                  )) : <Empty text="Работ пока нет. Добавь первую работу ниже." />}
                </div>
              </Card>

              <Card title="Добавить работу">
                <form className="form" onSubmit={addWork}>
                  <label>
                    Фото работы
                    <input name="photo" type="file" accept="image/*" />
                  </label>
                  <input name="image_url" placeholder="Или ссылка на фото, если надо" />
                  <input name="title" placeholder="Название, например: Нюдовый маникюр" />
                  <input name="description" placeholder="Описание / материалы / цена / детали" />
                  <button className="primary" disabled={isUploading}>
                    {isUploading ? "Загружаем..." : "Опубликовать работу"}
                  </button>
                </form>
                <p className="muted hint">
                  Теперь можно загрузить фото прямо с телефона. Ссылку оставили как запасной вариант.
                </p>
              </Card>
            </>
          )}

          {masterView === "bookings" && (
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
          )}

          {masterView === "clients" && (
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
          )}

          {masterView === "profile" && (
            <>
              <Card title="Профиль мастера">
                <div className="form">
                  <Input label="Имя мастера / студии" value={state.master.name || ""} onChange={(v) => updateMaster("name", v)} />
                  <Input label="Город" value={state.master.city || ""} onChange={(v) => updateMaster("city", v)} />
                  <label>
                    Категория
                    <select value={state.master.category || "manicure"} onChange={(e) => updateMaster("category", e.target.value)}>
                      {categories.filter((c) => c.slug !== "all").map((c) => <option value={c.slug} key={c.slug}>{c.emoji} {c.name}</option>)}
                    </select>
                  </label>
                  <Input label="Описание" value={state.master.about || ""} onChange={(v) => updateMaster("about", v)} />
                  <Input label="Контакт" value={state.master.contact || ""} onChange={(v) => updateMaster("contact", v)} />

                  <label>
                    Загрузить аватарку
                    <input type="file" accept="image/*" onChange={(e) => handleMasterImageUpload(e, "avatar_url", "avatars")} />
                  </label>
                  <Input label="Аватарка: ссылка на фото" value={state.master.avatar_url || ""} onChange={(v) => updateMaster("avatar_url", v)} />

                  <label>
                    Загрузить обложку
                    <input type="file" accept="image/*" onChange={(e) => handleMasterImageUpload(e, "cover_url", "covers")} />
                  </label>
                  <Input label="Обложка: ссылка на фото" value={state.master.cover_url || ""} onChange={(v) => updateMaster("cover_url", v)} />

                  <Input label="Ссылка" value={state.master.slug || ""} onChange={(v) => updateMaster("slug", v.replaceAll(" ", "_").toLowerCase())} />
                  <Input label="Эмодзи" value={state.master.emoji || ""} onChange={(v) => updateMaster("emoji", v)} />
                </div>
              </Card>

              <Card title="Публичная карточка">
                <div className="item">
                  <h4>{state.master.is_visible === false ? "Скрыта" : "Опубликована"}</h4>
                  <p className="muted last">
                    Клиенты видят тебя в каталоге города {state.master.city || "—"}.
                  </p>
                </div>
                <div className="quickGrid">
                  <button className="primary" onClick={copyLink}>Скопировать ссылку</button>
                  <button className="secondary" onClick={() => { setRole("client"); setScreen("public"); }}>Посмотреть как клиент</button>
                </div>
                <button className="reset" onClick={toggleVisibility}>
                  {state.master.is_visible === false ? "Опубликовать профиль" : "Скрыть профиль"}
                </button>
              </Card>
            </>
          )}
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
            <button className="primary" disabled={isBookingSubmitting} onClick={createBooking}>{isBookingSubmitting ? "Записываем..." : "Подтвердить запись"}</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function MasterShell({ master, masterView, setMasterView, setRole, setScreen }) {
  return (
    <>
      <section className="masterHero glass">
        <div>
          <p className="label">Мой кабинет</p>
          <h2>{master.emoji || "✨"} {master.name || "Мастер"}</h2>
          <p className="muted">{master.city || "Город не указан"} · {master.is_visible === false ? "профиль скрыт" : "профиль опубликован"}</p>
        </div>
        <button className="mini" onClick={() => { setRole("client"); setScreen("market"); }}>
          Каталог
        </button>
      </section>

      <nav className="tabs masterTabs">
        <Tab id="overview" screen={masterView} setScreen={setMasterView} icon={<Home size={17} />} label="Обзор" />
        <Tab id="services" screen={masterView} setScreen={setMasterView} icon={<Plus size={17} />} label="Услуги" />
        <Tab id="slots" screen={masterView} setScreen={setMasterView} icon={<CalendarDays size={17} />} label="Окошки" />
        <Tab id="works" screen={masterView} setScreen={setMasterView} icon={<Home size={17} />} label="Работы" />
        <Tab id="bookings" screen={masterView} setScreen={setMasterView} icon={<Link size={17} />} label="Записи" />
        <Tab id="clients" screen={masterView} setScreen={setMasterView} icon={<Users size={17} />} label="Клиенты" />
        <Tab id="profile" screen={masterView} setScreen={setMasterView} icon={<Home size={17} />} label="Профиль" />
      </nav>
    </>
  );
}


function Avatar({ master, big = false }) {
  const cls = big ? "avatar big" : "avatar";

  if (master?.avatar_url) {
    return (
      <div className={cls}>
        <img src={master.avatar_url} alt={master.name || "Мастер"} loading="lazy" decoding="async" />
      </div>
    );
  }

  return <div className={cls}>{master?.emoji || "✨"}</div>;
}

function WorkPost({ work, canDelete = false, onDelete }) {
  return (
    <article className="workPost">
      {work.image_url ? (
        <img className="workImage" src={work.image_url} alt={work.title || "Работа мастера"} loading="lazy" decoding="async" />
      ) : work.url ? (
        <img className="workImage" src={work.url} alt={work.title || "Работа мастера"} loading="lazy" decoding="async" />
      ) : (
        <div className="workImage placeholder">🖼️</div>
      )}
      <div className="workBody">
        <h4>{work.title || "Работа мастера"}</h4>
        {work.description ? <p className="muted last">{work.description}</p> : null}
        {canDelete ? (
          <button className="mini red deleteWork" onClick={onDelete}>Удалить работу</button>
        ) : null}
      </div>
    </article>
  );
}

function Stat({ title, value, sub }) {
  return <div className="stat glass"><span>{title}</span><b>{value}</b><small>{sub}</small></div>;
}

function Tab({ id, screen, setScreen, icon, label }) {
  return (
    <button className={screen === id ? "tab active" : "tab"} onClick={() => setScreen(id)}>
      {icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
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
