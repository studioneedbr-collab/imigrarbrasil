-- 030 — A CONTA DONA, QUE NÃO SE REBAIXA NEM SE APAGA.
--
-- Todo admin já tem acesso total. O que não existia era a garantia de que SEMPRE reste
-- alguém com esse acesso — e o caminho para perder isso não é hipotético neste projeto: a
-- tela de usuários só cria e lista, então toda edição de conta até hoje foi feita à mão no
-- SQL Editor do Supabase (a senha de 27/08 foi redefinida assim). Um `update users set
-- active = false` na linha errada, ou um `role = 'atendente'` num copiar-colar, deixa o
-- painel sem ninguém que administre — e a saída seria outro UPDATE no banco, que é
-- exatamente o gesto que causou o problema.
--
-- POR QUE UMA COLUNA E NÃO "O ADMIN MAIS ANTIGO". Inferir o dono por `created_at` funciona
-- até o dia em que alguém apaga e recria a conta, e aí o dono muda sem ninguém decidir. Se
-- é para uma conta ser inviolável, quem é ela tem de estar escrito.
--
-- POR QUE UM TRIGGER E NÃO UMA CONFERÊNCIA NO CÓDIGO. A regra tem de valer no lugar onde o
-- estrago acontece. Guarda em rota protege quem passa pela rota; o SQL Editor não passa.
-- É a mesma escolha da migration 023, onde "instância nasce desligada" é trigger e não
-- convenção.
alter table users add column if not exists dono boolean not null default false;

-- No máximo uma. Duas contas donas seria a mesma coisa que nenhuma: ninguém saberia qual
-- é a que não pode ser mexida.
create unique index if not exists users_dono_unico on users (dono) where dono;

-- O DONO É O PRIMEIRO ADMIN QUE EXISTIU — o do `/setup`, que criou o painel. Só roda se
-- ainda não houver dono: um banco em que alguém já escolheu não é reescrito por migration.
do $$
declare v_id uuid;
begin
  if exists (select 1 from users where dono) then return; end if;
  select id into v_id from users where role = 'admin' and active order by created_at limit 1;
  if v_id is null then
    select id into v_id from users where role = 'admin' order by created_at limit 1;
  end if;
  if v_id is not null then update users set dono = true where id = v_id; end if;
end $$;

-- ─── A PROTEÇÃO ───
--
-- Três coisas ficam proibidas na conta dona: apagar, desativar e rebaixar. O resto muda
-- normalmente — nome, senha, e-mail, setor. Proteger a conta não é congelá-la; é garantir
-- que ela continue conseguindo entrar e administrar.
--
-- Passar a coroa é permitido e é um UPDATE só: `update users set dono = true where id = …`
-- (o índice único derruba se a antiga não for desmarcada antes, o que é o comportamento
-- certo — a troca tem de ser deliberada).
create or replace function proteger_conta_dona() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.dono then
      raise exception 'A conta dona do painel não pode ser apagada. Passe a titularidade antes: update users set dono = false where id = %, e marque outra conta admin como dona.', old.id;
    end if;
    return old;
  end if;

  if old.dono and new.dono then
    if new.role <> 'admin' then
      raise exception 'A conta dona do painel não pode deixar de ser administradora. Passe a titularidade para outra conta admin antes de rebaixar esta.';
    end if;
    if not new.active then
      raise exception 'A conta dona do painel não pode ser desativada. Passe a titularidade para outra conta admin antes de desativar esta.';
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists users_proteger_dona on users;
create trigger users_proteger_dona
  before update or delete on users
  for each row execute function proteger_conta_dona();

comment on column users.dono is
  'A conta dona do painel. Não pode ser apagada, desativada nem rebaixada — nem por UPDATE '
  'à mão no SQL Editor, que é como as contas deste projeto sempre foram editadas. '
  'Ver migration 030 e lib/auth/papeis.ts.';
