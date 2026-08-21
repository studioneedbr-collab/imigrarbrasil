-- Sub-projeto 1 — modelo do fluxo comercial. Substitui 001/002.
-- Rodar no Supabase SQL Editor (uma vez).

create table if not exists clientes (
  id uuid default gen_random_uuid() primary key,
  nome text,
  cpf text unique,
  empresa text,
  email text,
  telefone text,
  cidade text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  whatsapp_number text not null unique,
  cliente_id uuid references clientes(id),
  contact_name text,
  estado_atual text default 'S0',
  status text default 'active'
    check (status in ('active','qualified','transferred','closed','followup')),
  handed_off_to text,
  handoff_reason text,
  lead_score integer default 0 check (lead_score between 0 and 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  cliente_id uuid references clientes(id),
  services_interested text[],
  employees_needed integer,
  region text,
  schedule text,
  urgency text check (urgency in ('immediate','short','medium','long')),
  estimated_value numeric(12,2),
  stage text default 'novo'
    check (stage in ('novo','qualificado','orcado','transferido','ganho','perdido')),
  score integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proposals (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clientes(id),
  conversation_id uuid references conversations(id),
  services jsonb,
  cost_breakdown jsonb,
  total_value numeric(12,2),
  pdf_url text,
  email_status text default 'nao_enviado'
    check (email_status in ('nao_enviado','rascunho_aberto','enviado')),
  created_at timestamptz default now()
);

create table if not exists transfer_tickets (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  cliente_id uuid references clientes(id),
  reason text not null,
  priority text default 'normal' check (priority in ('normal','urgent')),
  dossie jsonb not null,
  created_at timestamptz default now()
);

create table if not exists function_pricing (
  id uuid default gen_random_uuid() primary key,
  function_name text unique not null,
  base_salary numeric(10,2),
  schedule text default '5x2_44h',
  uniforme_mes numeric(10,2) default 46.97,
  equipamentos_func numeric(10,2) default 0,
  material_func numeric(10,2) default 0,
  price_confirmed boolean default false,
  active boolean default true,
  updated_at timestamptz default now()
);

create table if not exists agent_config (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into function_pricing (function_name, base_salary, schedule, uniforme_mes, equipamentos_func, material_func, price_confirmed)
values ('Auxiliar de Serviços Gerais', 1851.90, '5x2_44h', 46.97, 102.20, 391.18, true)
on conflict (function_name) do nothing;

create index if not exists idx_messages_conv on messages(conversation_id, created_at);
create index if not exists idx_leads_conv on leads(conversation_id);
create index if not exists idx_clientes_cpf on clientes(cpf);
