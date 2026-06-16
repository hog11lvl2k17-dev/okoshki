# Окошки — real MVP starter

Это уже стартовая база под настоящий Telegram Mini App.

## Что внутри

- React + Vite
- дизайн под mobile first
- экраны: Главная, Страница клиента, Мастер, Записи, Клиенты
- локальный режим без Supabase
- Supabase-ready структура
- SQL-схема базы
- Telegram Mini App SDK-ready

## Как запустить

1. Установи Node.js LTS.
2. Открой папку проекта в терминале.
3. Выполни:

```bash
npm install
npm run dev
```

4. Открой ссылку, которую покажет Vite, обычно:

```bash
http://localhost:5173
```

## Следующий этап

1. Создать проект в Supabase.
2. Выполнить SQL из файла `supabase/schema.sql`.
3. Заполнить `.env` по примеру `.env.example`.
4. Задеплоить на Vercel.
5. Создать Telegram-бота через BotFather.
6. Привязать URL Mini App.
