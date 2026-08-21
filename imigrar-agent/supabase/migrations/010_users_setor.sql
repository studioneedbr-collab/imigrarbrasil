-- 010 — Coluna `setor` em users.
--
-- Por que existe: a tela Usuários já oferecia "Usuário (acesso restrito a um
-- setor)" e o POST /api/users mandava `setor` no insert, mas a coluna nunca foi
-- criada (005_users.sql não a tinha). O PostgREST rejeitava o insert inteiro com
-- "column 'setor' of relation 'users' does not exist" — ou seja, o botão "Criar
-- usuário" NUNCA funcionou contra o Supabase, para nenhum papel.
--
-- E, como getUserByEmail lia um campo inexistente, o escopo por setor (usado em
-- /api/leads e na tela de Leads) sempre resolvia para null: qualquer conta não
-- admin acabava vendo a pipeline Comercial em vez da do próprio setor.

alter table users
  add column if not exists setor text
  check (setor is null or setor in ('comercial','operacional','rh','departamento_pessoal'));

-- 005 criava a tabela com `role default 'admin'`. Se algum insert futuro omitir
-- o papel, a conta nasce administradora — o default seguro é o oposto.
alter table users alter column role set default 'user';

-- Filtro por setor é feito em memória hoje, mas a listagem de usuários cresce
-- por e-mail/setor; o índice parcial é barato e evita seq scan quando crescer.
create index if not exists idx_users_setor on users(setor) where setor is not null;
