-- Окошки: аватарки, обложки и лента работ мастера

alter table public.masters
  add column if not exists avatar_url text;

alter table public.masters
  add column if not exists cover_url text;

alter table public.masters
  add column if not exists contact text;

create table if not exists public.master_photos (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references public.masters(id) on delete cascade,
  image_url text,
  title text,
  description text,
  created_at timestamptz default now()
);

create index if not exists master_photos_master_id_created_at_idx
  on public.master_photos (master_id, created_at desc);
