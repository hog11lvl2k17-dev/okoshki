-- Окошки: Telegram-аккаунты мастеров и поля для кабинета

alter table public.masters
  add column if not exists telegram_id text;

alter table public.masters
  add column if not exists telegram_username text;

alter table public.masters
  add column if not exists telegram_first_name text;

alter table public.masters
  add column if not exists contact text;

alter table public.masters
  add column if not exists subscription_status text default 'trial';

alter table public.masters
  add column if not exists trial_started_at timestamptz default now();

create unique index if not exists masters_telegram_id_unique
  on public.masters (telegram_id)
  where telegram_id is not null;
