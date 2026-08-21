-- =====================================================================
-- Hardening de segurança e performance (rodar no SQL Editor, após 004/005/006).
-- Idempotente.
-- =====================================================================

-- ---------- 1. Deduplicação do webhook ----------
-- A Meta reentrega a mesma mensagem quando não recebe 200 a tempo. O código já
-- checa antes de processar, mas a checagem é select-then-insert e duas entregas
-- simultâneas passam pelas duas. Este índice é a garantia real: a segunda
-- inserção falha no banco em vez de gerar resposta e proposta duplicadas.
create unique index if not exists idx_messages_wamid
  on messages(whatsapp_message_id)
  where whatsapp_message_id is not null;

-- ---------- 2. Papel padrão de usuário ----------
-- Era 'admin': toda conta criada nascia administradora. Contas novas passam a
-- ser comuns, e admin vira uma escolha explícita.
alter table users alter column role set default 'user';

-- ---------- 3. Índices para os ORDER BY do painel ----------
-- Todas as listagens ordenam por created_at desc e não tinham índice: a cada
-- poll do dashboard o Postgres fazia sort completo da tabela.
create index if not exists idx_leads_created         on leads(created_at desc);
create index if not exists idx_conversations_created on conversations(created_at desc);
create index if not exists idx_proposals_created     on proposals(created_at desc);
create index if not exists idx_clientes_created      on clientes(created_at desc);
create index if not exists idx_tickets_created       on transfer_tickets(created_at desc);

-- Busca de conversa pelo número (getOrCreateConversation, a cada mensagem
-- recebida) já é servida pelo unique constraint de whatsapp_number.

-- ---------- 4. Consistência de e-mail ----------
-- O login compara com eq() em minúsculas; garante que não entre nada fora disso.
update users set email = lower(trim(email)) where email <> lower(trim(email));
