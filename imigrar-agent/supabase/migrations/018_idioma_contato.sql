-- IDIOMA DO CONTATO.
--
-- A regra de idioma vivia só no prompt: o modelo olha a mensagem e responde na mesma
-- língua. Isso resolve o turno, e só o turno. Fora dele há dois buracos:
--
--   1. O follow-up automático (cron) monta a mensagem sem passar pelo modelo e sem
--      ninguém por perto — ia sempre em português, para todo mundo.
--   2. O atendente humano que assume a conversa no painel precisa saber em que idioma
--      responder ANTES de escrever a primeira linha.
--
-- ISO-639-1 (duas letras): 'pt', 'es', 'en', 'fr', 'ht', 'ar'…

alter table conversations add column if not exists idioma text;

comment on column conversations.idioma is
  'Idioma do contato em ISO-639-1, detectado no atendimento. Alimenta o follow-up automático e o painel.';

-- Só faz sentido consultar por idioma para separar as conversas que NÃO são em português
-- (relatório de atendimento multi-idioma). O índice parcial é o que serve a isso.
create index if not exists conversations_idioma_idx
  on conversations (idioma) where idioma is not null and idioma <> 'pt';
