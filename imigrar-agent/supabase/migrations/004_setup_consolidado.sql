-- =====================================================================
-- Shine Rio · Agente Comercial — SETUP CONSOLIDADO (rodar no SQL Editor)
-- Substitui 001 + 002 + 003. Idempotente: pode rodar mais de uma vez.
-- Contém a UNIÃO das colunas que lib/data/supabase-repository.ts usa.
-- =====================================================================

-- ---------- CLIENTES ----------
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

-- ---------- CONVERSAS ----------
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
alter table conversations add column if not exists cliente_id uuid references clientes(id);
alter table conversations add column if not exists estado_atual text default 'S0';
alter table conversations add column if not exists handed_off_to text;
alter table conversations add column if not exists handoff_reason text;

-- ---------- MENSAGENS ----------
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  whatsapp_message_id text,
  created_at timestamptz default now()
);
alter table messages add column if not exists whatsapp_message_id text;

-- ---------- LEADS ----------
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  cliente_id uuid references clientes(id),
  contact_name text,
  company_name text,
  whatsapp_number text,
  email text,
  client_type text,               -- sindico | rh | diretor | proprietario | ceo | facilities
  services_interested text[],
  employees_needed integer,
  region text,
  schedule text,
  contract_duration text,
  estimated_value numeric(12,2),
  status text default 'new'
    check (status in ('new','contacted','proposal_sent','negotiating','won','lost')),
  stage text default 'novo'
    check (stage in ('novo','qualificado','orcado','transferido','ganho','perdido')),
  score integer default 0,
  urgency text check (urgency in ('immediate','short','medium','long')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table leads add column if not exists cliente_id uuid references clientes(id);
alter table leads add column if not exists contact_name text;
alter table leads add column if not exists company_name text;
alter table leads add column if not exists whatsapp_number text;
alter table leads add column if not exists email text;
alter table leads add column if not exists client_type text;
alter table leads add column if not exists schedule text;
alter table leads add column if not exists contract_duration text;
alter table leads add column if not exists stage text default 'novo';
alter table leads add column if not exists score integer default 0;

-- ---------- PROPOSTAS ----------
create table if not exists proposals (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references leads(id),
  cliente_id uuid references clientes(id),
  conversation_id uuid references conversations(id),
  services jsonb,
  cost_breakdown jsonb,
  total_value numeric(12,2),
  pdf_url text,
  status text default 'sent'
    check (status in ('draft','sent','viewed','accepted','rejected')),
  email_status text default 'nao_enviado'
    check (email_status in ('nao_enviado','rascunho_aberto','enviado')),
  created_at timestamptz default now()
);
alter table proposals add column if not exists lead_id uuid references leads(id);
alter table proposals add column if not exists cliente_id uuid references clientes(id);
alter table proposals add column if not exists email_status text default 'nao_enviado';

-- ---------- FILA DE FOLLOW-UP ----------
create table if not exists followup_queue (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  scheduled_at timestamptz not null,
  message text not null,
  status text default 'pending' check (status in ('pending','sent','cancelled')),
  attempt integer default 1,
  created_at timestamptz default now()
);

-- ---------- TICKETS DE TRANSFERÊNCIA (handoff humano) ----------
create table if not exists transfer_tickets (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  cliente_id uuid references clientes(id),
  reason text not null,
  priority text default 'normal' check (priority in ('normal','urgent')),
  dossie jsonb not null,
  created_at timestamptz default now()
);

-- ---------- CATÁLOGO DE SERVIÇOS ----------
create table if not exists services_catalog (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  category text,                  -- limpeza | portaria | manutencao | administrativo | outros
  base_salary numeric(10,2),
  cost_per_employee numeric(10,2),
  sale_price numeric(10,2),
  margin_percent numeric(5,2) default 20,
  schedule text,
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ---------- PRECIFICAÇÃO POR FUNÇÃO ----------
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

-- ---------- CONFIG DO AGENTE ----------
create table if not exists agent_config (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- ---------- ÍNDICES ----------
create index if not exists idx_messages_conv    on messages(conversation_id, created_at);
create index if not exists idx_leads_conv       on leads(conversation_id);
create index if not exists idx_clientes_cpf     on clientes(cpf);
create index if not exists idx_followup_status  on followup_queue(status, scheduled_at);
create index if not exists idx_services_active  on services_catalog(active);
create index if not exists idx_transfer_conv    on transfer_tickets(conversation_id);

-- =====================================================================
-- SEEDS
-- =====================================================================
insert into services_catalog (name, category, base_salary, cost_per_employee, sale_price, margin_percent, schedule, description)
values
 ('Auxiliar de Serviços Gerais','limpeza',       1851.90,3930.10, 4873.52,20,'5x2_44h','Limpeza e conservação (ASG)'),
 ('Porteiro','portaria',                         1998.00,8367.78,10376.48,20,'12x36',  'Controle de acesso e portaria'),
 ('Recepcionista','administrativo',              2100.00,4361.08, 5407.96,20,'5x2_44h','Recepção e atendimento'),
 ('Zelador','manutencao',                        2050.00,4274.22, 5300.25,20,'5x2_44h','Zeladoria predial'),
 ('Jardineiro','manutencao',                     1950.00,4100.51, 5084.84,20,'6x1_44h','Jardinagem e paisagismo'),
 ('Operador de Piscina','manutencao',            2000.00,4187.37, 5192.55,20,'5x2_44h','Guardião/operador de piscina')
on conflict (name) do nothing;

insert into function_pricing (function_name, base_salary, schedule, uniforme_mes, equipamentos_func, material_func, price_confirmed)
values ('Auxiliar de Serviços Gerais', 1851.90, '5x2_44h', 46.97, 102.20, 391.18, true)
on conflict (function_name) do nothing;

insert into agent_config (key, value)
values ('pricing', '{"bdi":0.24004,"beneficios_fixos":666.19,"uniforme":46.97}'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- RLS — o app acessa 100% server-side com a SERVICE_ROLE_KEY (que ignora
-- RLS). Ligar RLS sem policies bloqueia qualquer acesso via anon key.
-- =====================================================================
alter table clientes         enable row level security;
alter table conversations    enable row level security;
alter table messages         enable row level security;
alter table leads            enable row level security;
alter table proposals        enable row level security;
alter table followup_queue   enable row level security;
alter table transfer_tickets enable row level security;
alter table services_catalog enable row level security;
alter table function_pricing enable row level security;
alter table agent_config     enable row level security;
