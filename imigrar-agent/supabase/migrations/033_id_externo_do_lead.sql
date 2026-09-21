-- 033 — O IDENTIFICADOR QUE A PLANILHA JÁ TEM.
--
-- A carga inicial guardou o "ID Lead" da planilha dentro de `notes`, em texto
-- ("Importado da planilha do comercial (290426-01)."). Funcionou para o que precisava na
-- hora, e é frágil para o que vem: reimportar a mesma planilha depois de atualizada.
--
-- POR QUE ISTO DECIDE SE A REIMPORTAÇÃO DUPLICA. O telefone é a chave natural e resolve
-- quase tudo — mas ele MUDA. A pessoa troca de número, o time corrige um DDD errado na
-- ficha, alguém arruma o "+55 9 8253 2197" que estava sem DDD. Em qualquer um desses
-- casos, a linha da planilha deixa de bater com o caso que ela mesma criou, e a
-- reimportação abre um card novo ao lado do antigo: duas fichas da mesma pessoa, com
-- metade da história em cada. É exatamente o defeito que a deduplicação por telefone
-- existe para evitar, reaparecendo por outra porta.
--
-- Com a coluna, a linha da planilha e o caso ficam amarrados por um identificador que não
-- muda. Telefone continua sendo a segunda chave, para as planilhas que não têm ID.
--
-- O ÍNDICE É ÚNICO POR FONTE, e não global: dois escritórios, ou duas planilhas
-- diferentes, podem legitimamente ter uma linha "001". O par (fonte, id) é o que é único.
-- `where ... is not null` mantém fora do índice todo lead que não veio de importação —
-- que é a maioria esmagadora.

alter table leads add column if not exists origem_externa_fonte text;
alter table leads add column if not exists origem_externa_id text;

create unique index if not exists idx_leads_origem_externa
  on leads (origem_externa_fonte, origem_externa_id)
  where origem_externa_fonte is not null and origem_externa_id is not null;

comment on column leads.origem_externa_id is
  'O identificador da linha na planilha de onde este caso veio. É o que faz reimportar a mesma planilha atualizar em vez de duplicar.';
