-- 020 — SAÚDE DA OPERAÇÃO E ACOMPANHAMENTO.
--
-- Duas ausências que só aparecem quando já custaram caro.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O QUE FALHA HOJE, FALHA EM SILÊNCIO.
--
-- A transcrição de áudio degrada de propósito: sem chave, ou com erro na API, ela
-- devolve null e a Ana pede para a pessoa escrever. É o comportamento seguro — mas
-- ninguém fica sabendo. E quem manda áudio neste atendimento é justamente quem não
-- escreve bem em português, quem está com pressa e quem está com medo. Um áudio que
-- não foi transcrito não é um erro técnico: é um lead perdido, e some sem deixar rastro.
--
-- O mesmo vale para a chamada ao DeepSeek: quando ela falha, o atendimento cai no motor
-- determinístico e continua — de fora, parece que está tudo bem.
--
-- Esta tabela existe para que essas quedas tenham onde aparecer.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists eventos_operacao (
  id uuid default gen_random_uuid() primary key,
  tipo text not null check (tipo in ('transcricao_falhou','deepseek_falhou','documento_falhou')),
  conversation_id uuid references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  -- O áudio original. É o que permite alguém OUVIR o que não foi transcrito, em vez de
  -- só saber que falhou.
  media_url text,
  detalhe text,
  resolvido_em timestamptz,
  resolvido_por text,
  criado_em timestamptz default now()
);

comment on table eventos_operacao is
  'Falhas que degradam em silêncio. Um áudio não transcrito é um lead perdido — aqui ele tem onde aparecer.';

-- A consulta que a tela faz é sempre "o que quebrou e ainda não foi tratado".
create index if not exists idx_eventos_pendentes on eventos_operacao (criado_em desc)
  where resolvido_em is null;
create index if not exists idx_eventos_tipo on eventos_operacao (tipo, criado_em desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O CICLO AQUI É LONGO, E LEAD PARADO NÃO AVISA QUE PAROU.
--
-- Em imigração a pessoa some por três semanas juntando documento no consulado e volta.
-- Isso não é desinteresse — é o processo. Mas sem um lembrete com data e motivo, ela
-- esfria e ninguém percebe: a fila mostra quem chegou, não quem está esperando.
--
-- A nota é obrigatória de propósito. "Ligar dia 12" não diz nada a quem abrir o painel
-- daqui a duas semanas; "ligar quando ele conseguir a certidão consular" diz tudo.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists lembretes (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references leads(id) on delete cascade,
  quando date not null,
  nota text not null check (length(trim(nota)) > 0),
  autor text not null,
  feito_em timestamptz,
  feito_por text,
  criado_em timestamptz default now()
);

comment on column lembretes.nota is
  'Por que voltar a falar com esta pessoa. Obrigatória: sem ela o lembrete não diz nada a quem abrir o painel duas semanas depois.';

create index if not exists idx_lembretes_pendentes on lembretes (quando)
  where feito_em is null;
create index if not exists idx_lembretes_lead on lembretes (lead_id);

alter table eventos_operacao enable row level security;
alter table lembretes enable row level security;
