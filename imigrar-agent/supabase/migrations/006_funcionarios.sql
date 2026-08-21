create table if not exists funcionarios (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cpf text unique,
  cargo text,
  setor text,
  telefone text,
  email text,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_funcionarios_cpf on funcionarios(cpf);
alter table funcionarios enable row level security;
