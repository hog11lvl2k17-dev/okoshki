-- Окошки MVP database schema

create table if not exists masters (
  id uuid primary key default gen_random_uuid(),
  telegram_id text unique,
  name text not null default 'Мастер',
  about text default '',
  slug text unique not null,
  emoji text default '✨',
  tariff text default 'free',
  created_at timestamptz default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references masters(id) on delete cascade,
  name text not null,
  price integer not null default 0,
  duration integer not null default 60,
  created_at timestamptz default now()
);

create table if not exists slots (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references masters(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  slot_date date not null,
  slot_time time not null,
  is_hot boolean default false,
  created_at timestamptz default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references masters(id) on delete cascade,
  name text not null,
  contact text not null,
  note text default '',
  visits integer default 1,
  created_at timestamptz default now(),
  last_visit_at timestamptz default now(),
  unique(master_id, contact)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references masters(id) on delete cascade,
  slot_id uuid references slots(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  client_contact text not null,
  note text default '',
  status text default 'active',
  created_at timestamptz default now()
);
