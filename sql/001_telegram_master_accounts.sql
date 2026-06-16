-- Окошки: привязка кабинета мастера к Telegram ID

alter table public.masters
  add column if not exists telegram_id text;

alter table public.masters
  add column if not exists telegram_username text;

alter table public.masters
  add column if not exists telegram_first_name text;

alter table public.masters
  add column if not exists contact text;

create unique index if not exists masters_telegram_id_unique
  on public.masters (telegram_id)
  where telegram_id is not null;
