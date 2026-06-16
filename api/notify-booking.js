export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log("Telegram notification skipped: TELEGRAM_BOT_TOKEN is missing");
    return res.status(200).json({ ok: false, skipped: true });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      masterTelegramId = "",
      masterName = "Мастер",
      clientName = "Клиент",
      clientContact = "",
      serviceName = "Услуга",
      slotDate = "",
      slotTime = "",
      price = "",
      note = "",
      appUrl = "",
    } = body || {};

    const chatId = masterTelegramId || process.env.TELEGRAM_MASTER_CHAT_ID;

    if (!chatId) {
      console.log("Telegram notification skipped: chat id is missing");
      return res.status(200).json({ ok: false, skipped: true });
    }

    const text = [
      "🔥 Новая запись в Окошках",
      "",
      `👩‍💼 Мастер: ${masterName}`,
      `👤 Клиент: ${clientName}`,
      clientContact ? `📲 Контакт: ${clientContact}` : "",
      `💅 Услуга: ${serviceName}`,
      slotDate ? `📅 Дата: ${slotDate}` : "",
      slotTime ? `⏰ Время: ${slotTime}` : "",
      price ? `💰 Цена: ${price}` : "",
      note ? `📝 Комментарий: ${note}` : "",
      appUrl ? `\nОткрыть: ${appUrl}` : "",
    ].filter(Boolean).join("\n");

    const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgResponse.json();

    if (!tgResponse.ok) {
      console.error("Telegram API error:", tgData);
      return res.status(200).json({ ok: false, telegram: tgData });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Notify error:", error);
    return res.status(200).json({ ok: false, error: error.message });
  }
}
