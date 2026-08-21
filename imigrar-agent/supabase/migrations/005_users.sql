create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  password_hash text not null,
  name text,
  role text default 'admin' check (role in ('admin','user')),
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_users_email on users(email);

alter table users enable row level security;
