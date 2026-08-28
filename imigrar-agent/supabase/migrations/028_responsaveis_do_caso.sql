-- 028 — TROCAR O RESPONSÁVEL, E TER MAIS DE UM NO CASO.
--
-- `responsavel_id` sempre existiu e sempre foi um só: quem assumiu primeiro. Na prática o
-- caso troca de mãos (férias, plantão, alguém que entende de refúgio entra no meio) e
-- quase sempre tem mais de uma pessoa dentro — quem negocia e quem protocola não são a
-- mesma pessoa. Sem lugar para isso, a informação vivia em "Observações internas", que
-- ninguém lê antes de ligar para o cliente.
--
-- DUAS COISAS DIFERENTES, E POR ISSO DUAS COLUNAS:
--
--   responsavel_id  O DONO. Um só, sempre. É quem responde pelo caso, é o nome que
--                   aparece no card e é por ele que "Meus atendimentos" filtra. Uma lista
--                   sem dono é uma lista em que ninguém é responsável.
--   apoio_ids       QUEM MAIS ESTÁ NO CASO. Zero ou muitos. Enxergam e trabalham, mas o
--                   caso não conta como "meu" para eles — senão o mesmo caso apareceria
--                   como pendência de quatro pessoas ao mesmo tempo.
--
-- `assumido_em` continua marcando o PRIMEIRO a assumir e nunca é reescrito: uma troca de
-- responsável amanhã não pode reiniciar o "tempo até o primeiro contato humano".
alter table leads add column if not exists apoio_ids uuid[] not null default '{}';

create index if not exists leads_apoio on leads using gin (apoio_ids);
