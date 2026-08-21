-- 009 — Separa "encaminhada ao setor" de "humano assumiu" + persiste a mídia recebida.
-- Rode no SQL Editor do Supabase (idempotente).

-- 1) QUEM assumiu a conversa. Antes, status='transferred' significava as duas coisas
--    ao mesmo tempo (a Shayene encaminhou pro setor E um atendente assumiu), então
--    toda conversa encaminhada aparecia no painel como "Você assumiu esta conversa".
--    A partir daqui: assumed_by preenchido = tem gente de verdade no comando
--    (e só então a Shayene fica em silêncio no WhatsApp).
alter table conversations add column if not exists assumed_by  text;
alter table conversations add column if not exists assumed_at  timestamptz;

-- 2) Mídia recebida no WhatsApp (imagem, PDF, documento). Antes a URL era descartada
--    e ficava só o texto "📎 Documento recebido: imagem.jpg" — nada para visualizar.
--    media_text guarda o que foi LIDO do arquivo (OCR/visão), que também entra no
--    histórico para a Shayene responder com contexto.
alter table messages add column if not exists media_url  text;
alter table messages add column if not exists media_type text;   -- 'image' | 'document' | 'audio'
alter table messages add column if not exists media_name text;
alter table messages add column if not exists media_text text;

-- 3) Índices: a lista de Documentos varre só as mensagens com anexo, e o painel
--    filtra conversas por quem assumiu.
create index if not exists idx_messages_media
  on messages (created_at desc) where media_url is not null;
create index if not exists idx_conversations_assumed_by
  on conversations (assumed_by) where assumed_by is not null;
