-- Окошки: загрузка фото, удаление работ и отзывы

alter table public.masters
  add column if not exists avatar_url text;

alter table public.masters
  add column if not exists cover_url text;

alter table public.master_photos
  add column if not exists image_url text;

alter table public.master_photos
  add column if not exists title text;

alter table public.master_photos
  add column if not exists description text;

alter table public.master_photos
  add column if not exists created_at timestamptz default now();

-- Если таблица раньше была с колонкой url, делаем совместимость.
alter table public.master_photos
  alter column url drop not null;

update public.master_photos
set image_url = url
where image_url is null and url is not null;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references public.masters(id) on delete cascade,
  client_name text not null,
  rating numeric default 5,
  text text,
  created_at timestamptz default now()
);

alter table public.reviews
  add column if not exists client_name text;

alter table public.reviews
  add column if not exists rating numeric default 5;

alter table public.reviews
  add column if not exists text text;

alter table public.reviews
  add column if not exists created_at timestamptz default now();

-- Storage bucket для фото мастеров.
insert into storage.buckets (id, name, public)
values ('master-uploads', 'master-uploads', true)
on conflict (id) do update set public = true;

-- MVP policies: публичное чтение, загрузка/удаление через anon key.
-- На этапе теста это норм, позже зажмём через Supabase Auth/RLS.
drop policy if exists "master_uploads_public_read" on storage.objects;
create policy "master_uploads_public_read"
on storage.objects for select
to public
using (bucket_id = 'master-uploads');

drop policy if exists "master_uploads_anon_insert" on storage.objects;
create policy "master_uploads_anon_insert"
on storage.objects for insert
to anon
with check (bucket_id = 'master-uploads');

drop policy if exists "master_uploads_anon_update" on storage.objects;
create policy "master_uploads_anon_update"
on storage.objects for update
to anon
using (bucket_id = 'master-uploads')
with check (bucket_id = 'master-uploads');

drop policy if exists "master_uploads_anon_delete" on storage.objects;
create policy "master_uploads_anon_delete"
on storage.objects for delete
to anon
using (bucket_id = 'master-uploads');

notify pgrst, 'reload schema';
