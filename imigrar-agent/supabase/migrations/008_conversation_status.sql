-- 008 — Ciclo de status da conversa + colunas de follow-up/inatividade.
-- Rode no SQL Editor do Supabase (idempotente).

-- 1) Migra os valores antigos para o novo vocabulário (antes de trocar o CHECK).
update conversations set status = 'negotiating' where status = 'qualified';
update conversations set status = 'finished'    where status = 'closed';
update conversations set status = 'waiting'      where status = 'followup';

-- 2) Atualiza o CHECK constraint da coluna status.
alter table conversations drop constraint if exists conversations_status_check;
alter table conversations
  add constraint conversations_status_check
  check (status in ('active','waiting','negotiating','transferred','finished','inactive'));

-- 3) Colunas de controle do ciclo de vida.
alter table conversations add column if not exists last_message_at timestamptz default now();
alter table conversations add column if not exists followup_sent_at timestamptz;
alter table conversations add column if not exists reopened_at timestamptz;

-- 4) Índice para o cron job (busca por status + tempo desde a última mensagem).
create index if not exists idx_conversations_status_last_msg
  on conversations (status, last_message_at);
