-- 016 — Pedido de parar (opt-out). Proteção contra banimento do WhatsApp.
-- Rode no SQL Editor do Supabase (idempotente).
--
-- O que derruba um número no WhatsApp não é volume, é taxa de BLOQUEIO E DENÚNCIA. E o
-- caminho mais curto para uma denúncia é a pessoa pedir para parar e continuar recebendo
-- mensagem. Até aqui não havia onde guardar esse pedido: quem escrevia "para de me mandar
-- mensagem" recebia resposta na hora e ainda levava o follow-up automático 24h depois.
--
-- opt_out_at    → pediu explicitamente para parar. Silêncio total a partir daí.
-- no_followup_at → disse que não tem interesse. A conversa segue, o follow-up não.
alter table conversations add column if not exists opt_out_at     timestamptz;
alter table conversations add column if not exists no_followup_at timestamptz;

-- O cron de follow-up varre conversas em 'waiting' e agora precisa pular estas duas.
-- O índice parcial é pequeno de propósito: só interessa quem pediu para sair.
create index if not exists idx_conversations_opt_out
  on conversations (opt_out_at) where opt_out_at is not null;
create index if not exists idx_conversations_no_followup
  on conversations (no_followup_at) where no_followup_at is not null;
