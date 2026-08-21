-- Agente Comercial IA · Shine Rio — Schema inicial (Fase 1)
-- Postgres / Supabase

-- Conversas
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_number TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'qualified', 'transferred', 'closed', 'followup')),
  lead_score INTEGER DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mensagens
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads qualificados
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_name TEXT,
  company_name TEXT,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  client_type TEXT, -- 'sindico', 'rh', 'diretor', 'proprietario', 'ceo', 'facilities'
  services_interested TEXT[], -- array de serviços
  employees_needed INTEGER,
  region TEXT,
  contract_duration TEXT,
  estimated_value DECIMAL(10,2),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'proposal_sent', 'negotiating', 'won', 'lost')),
  urgency TEXT CHECK (urgency IN ('immediate', 'short', 'medium', 'long')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Propostas geradas
CREATE TABLE proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  conversation_id UUID REFERENCES conversations(id),
  pdf_url TEXT,
  services JSONB, -- detalhes dos serviços
  total_value DECIMAL(10,2),
  cost_breakdown JSONB, -- custo detalhado
  status TEXT DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fila de follow-up
CREATE TABLE followup_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  attempt INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuração do agente
CREATE TABLE agent_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de serviços e preços
CREATE TABLE services_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT, -- 'limpeza', 'portaria', 'manutencao', 'administrativo', 'outros'
  base_salary DECIMAL(10,2),
  cost_per_employee DECIMAL(10,2), -- custo total Shine (sem lucro)
  sale_price DECIMAL(10,2), -- preço de venda
  margin_percent DECIMAL(5,2) DEFAULT 20,
  schedule TEXT, -- '5x2_44h', '12x36', etc.
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_conversation ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_followup_status ON followup_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_services_active ON services_catalog(active);
