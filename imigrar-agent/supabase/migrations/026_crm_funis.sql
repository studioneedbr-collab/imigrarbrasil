-- 026 — O QUADRO VIRA CRM: FUNIS E ETAPAS QUE O ESCRITÓRIO DESENHA.
--
-- O quadro tinha cinco colunas fixas, escritas em código: novo, em atendimento, agendado,
-- fechado, perdido. Elas descrevem o que o SISTEMA sabe de um caso — e não descrevem o
-- trabalho: entre "em atendimento" e "fechado" cabem semanas de "esperando a certidão
-- consular", "protocolo enviado", "exigência a cumprir", e todos esses casos ficavam
-- empilhados na mesma coluna, indistinguíveis. Um quadro assim organiza o software, não o
-- escritório.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE NÃO MUDA: `leads.atendimento_status`.
--
-- É ele que a fila lê, que decide se um caso está encerrado, que exige motivo em
-- "perdido" e que entra no log de acesso. Etapa nova NÃO é status novo: cada etapa aponta
-- para um dos cinco status (coluna `status`, com check), e mover um card aplica a mesma
-- ação que o botão do detalhe sempre aplicou.
--
-- Se as etapas fossem um estado paralelo, o primeiro efeito seria silencioso e grave: um
-- caso "fechado" na etapa "aguardando documento" continuaria fora da fila, invisível, sem
-- ninguém entender por quê.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists crm_funis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ordem int not null default 0,
  -- O funil onde cai quem chega sem funil escolhido. O índice único parcial garante que
  -- exista NO MÁXIMO um: dois padrões significa metade dos casos novos sumindo do quadro
  -- que a pessoa está olhando.
  padrao boolean not null default false,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

create unique index if not exists crm_funis_padrao_unico
  on crm_funis (padrao) where padrao and not arquivado;

create table if not exists crm_etapas (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references crm_funis(id) on delete cascade,
  nome text not null,
  ajuda text,
  status text not null check (status in ('novo','em_atendimento','agendado','fechado','perdido')),
  ordem int not null default 0,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists crm_etapas_funil on crm_etapas (funil_id, ordem);

-- ONDE O CASO ESTÁ NO QUADRO.
--
-- Nulo é o normal, não é falta de dado: quem nunca foi movido à mão aparece na primeira
-- etapa cujo status bate com o `atendimento_status` (ver lib/crm/funil.ts). É o que faz um
-- funil recém-criado abrir cheio em vez de abrir vazio parecendo perda de dados.
--
-- `on delete set null` nas duas: apagar um funil não pode apagar caso nenhum — o caso
-- volta a ser distribuído pelo status, que é o dado do domínio e nunca foi para o lixo.
alter table leads add column if not exists funil_id uuid references crm_funis(id) on delete set null;
alter table leads add column if not exists etapa_id uuid references crm_etapas(id) on delete set null;

create index if not exists leads_funil_etapa on leads (funil_id, etapa_id);

-- O FUNIL PADRÃO, com as cinco colunas de antes.
--
-- Sem ele o painel abriria num quadro vazio até alguém criar o primeiro funil — e um
-- quadro vazio esconde todos os casos de uma vez. As etapas nascem com o mesmo nome e o
-- mesmo texto de ajuda que estavam no código, para que a migration não mude nada do que
-- se vê na tela: ela só passa a permitir mudar.
do $$
declare v_funil uuid;
begin
  if not exists (select 1 from crm_funis) then
    insert into crm_funis (nome, descricao, ordem, padrao)
    values ('Atendimento', 'O caminho de todo caso que chega pelo WhatsApp.', 0, true)
    returning id into v_funil;

    insert into crm_etapas (funil_id, nome, ajuda, status, ordem) values
      (v_funil, 'Novo',             'Chegou e ninguém pegou.',                          'novo',           0),
      (v_funil, 'Em atendimento',   'Alguém do time está com a bola.',                  'em_atendimento', 1),
      (v_funil, 'Reunião agendada', 'Reunião marcada com a pessoa.',                    'agendado',       2),
      (v_funil, 'Fechado',          'Virou cliente ou o assunto se resolveu.',          'fechado',        3),
      (v_funil, 'Perdido',          'Não virou atendimento — com o motivo registrado.', 'perdido',        4);
  end if;
end $$;
