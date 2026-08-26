-- 019 — A FILA DE PRAZOS.
--
-- O painel que originou este código é um funil de vendas: ordena por lead mais recente,
-- mede conversão e trata todo contato como oportunidade equivalente. Este atendimento
-- não é isso. Boa parte dos casos de maior valor chega com PRAZO PROCESSUAL CORRENDO —
-- multa migratória, indeferimento de refúgio, notificação de saída do país. Esses prazos
-- são curtos e fatais: ordenar por "mais recente" faz alguém perder um prazo.
--
-- Esta migration cria os campos que a fila lê, e uma regra estrutural sobre datas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A REGRA DAS DATAS: a IA SINALIZA, o humano CONFIRMA.
--
-- `tem_prazo_correndo` é da IA. `prazo_data_notificacao` e `prazo_data_limite` NUNCA são.
-- A pessoa frequentemente não sabe a data da notificação, confunde com o dia em que
-- recebeu o papel, ou manda foto ilegível — um contador regressivo em cima de uma data
-- inferida pelo modelo é exatamente o erro que faz alguém perder prazo.
--
-- A garantia não é um comentário: é o CHECK `leads_prazo_confirmado_ck` mais abaixo.
-- Data só existe com o nome de quem confirmou junto. O agente não tem nome para pôr ali,
-- e `upsertLead` (lib/data/*-repository.ts) não mapeia estas colunas — só
-- `confirmarPrazo`, que exige o autor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Identidade e situação migratória ─────────────────────────────────────────
alter table leads add column if not exists idioma text;
alter table leads add column if not exists nacionalidade text;
alter table leads add column if not exists localizacao text
  check (localizacao is null or localizacao in ('brasil','exterior'));
alter table leads add column if not exists pais_exterior text;
alter table leads add column if not exists entrada_controle_migratorio boolean;
alter table leads add column if not exists documentos_possui text;
alter table leads add column if not exists documentos_faltantes text;
alter table leads add column if not exists vinculo_familiar_brasil text;
alter table leads add column if not exists situacao_documental text;
alter table leads add column if not exists objetivo text;
alter table leads add column if not exists modalidade_provavel text;
alter table leads add column if not exists resumo text;

comment on column leads.idioma is
  'ISO-639-1 do idioma em que a pessoa escreve. O time precisa saber se consegue atender ANTES de abrir a conversa.';
comment on column leads.localizacao is
  'brasil | exterior. É a distinção que muda o atendimento inteiro; pais_exterior só faz sentido com localizacao = exterior.';

-- ── Prazo processual ─────────────────────────────────────────────────────────
alter table leads add column if not exists tem_prazo_correndo boolean not null default false;
alter table leads add column if not exists prazo_tipo text
  check (prazo_tipo is null or prazo_tipo in ('multa','indeferimento','notificacao_saida','outro'));
alter table leads add column if not exists prazo_data_notificacao date;
alter table leads add column if not exists prazo_data_limite date;
alter table leads add column if not exists prazo_confirmado_por text;
alter table leads add column if not exists prazo_confirmado_em timestamptz;

comment on column leads.tem_prazo_correndo is
  'SINALIZADO pela IA: a pessoa mencionou multa, indeferimento ou notificação de saída. Não é uma data — é um alerta.';
comment on column leads.prazo_data_limite is
  'PREENCHIDA POR HUMANO, depois de confirmar com a pessoa. Enquanto for null o lead fica no bloco "prazo a confirmar", com prioridade máxima e SEM contador.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_prazo_confirmado_ck') then
    alter table leads add constraint leads_prazo_confirmado_ck check (
      (prazo_data_limite is null and prazo_data_notificacao is null)
      or prazo_confirmado_por is not null
    );
  end if;
end $$;

-- ── Classificação ────────────────────────────────────────────────────────────
-- QUENTE_PRAZO, QUENTE_JUDICIAL, MORNO_ADMINISTRATIVO e EXTERIOR_VISTO entram na fila.
-- DPU, CURIOSO e FORA_ESCOPO NÃO: vão para a aba de conversas filtradas. Tirar essas
-- conversas da frente do time é o objetivo do produto, não um efeito colateral.
alter table leads add column if not exists classificacao text
  check (classificacao is null or classificacao in
    ('QUENTE_PRAZO','QUENTE_JUDICIAL','MORNO_ADMINISTRATIVO','EXTERIOR_VISTO','DPU','CURIOSO','FORA_ESCOPO'));
-- A classificação que a IA deu ANTES de qualquer mão humana. É o denominador da taxa de
-- reclassificação — sem guardá-la, "quanto o humano discorda da IA" é incalculável.
alter table leads add column if not exists classificacao_ia text;

-- ── Atendimento ──────────────────────────────────────────────────────────────
-- Coluna nova em vez de reaproveitar `status`: aquele é o enum do funil de vendas
-- (new/contacted/proposal_sent/negotiating/won/lost) e não descreve este trabalho.
alter table leads add column if not exists atendimento_status text not null default 'novo'
  check (atendimento_status in ('novo','em_atendimento','agendado','fechado','perdido'));
alter table leads add column if not exists motivo_perda text;
alter table leads add column if not exists responsavel_id uuid references users(id);
-- Quando um humano assumiu. Alimenta o "tempo médio até primeiro contato humano", que é
-- medido separadamente para QUENTE_PRAZO.
alter table leads add column if not exists assumido_em timestamptz;
-- Resgate: um humano devolveu à fila algo que o agente tinha filtrado.
alter table leads add column if not exists resgatado_em timestamptz;
alter table leads add column if not exists resgatado_por text;

-- ── Índices que a fila usa ───────────────────────────────────────────────────
-- Bloco 1: prazo sinalizado, data ainda não confirmada. Deve ser instantâneo — é a
-- primeira coisa que a tela inicial pergunta.
create index if not exists idx_leads_prazo_a_confirmar on leads (created_at)
  where tem_prazo_correndo and prazo_data_limite is null;
-- Bloco 2: prazos correndo, por data limite crescente.
create index if not exists idx_leads_prazo_limite on leads (prazo_data_limite)
  where prazo_data_limite is not null;
create index if not exists idx_leads_classificacao on leads (classificacao)
  where classificacao is not null;

-- ── Reclassificação ──────────────────────────────────────────────────────────
-- Quando o humano discorda da IA, o par (de → para) é o dado que calibra o agente.
create table if not exists lead_reclassificacoes (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references leads(id) on delete cascade,
  de text,
  para text not null,
  motivo text,
  autor text not null,
  criado_em timestamptz default now()
);
create index if not exists idx_reclass_lead on lead_reclassificacoes(lead_id);
create index if not exists idx_reclass_data on lead_reclassificacoes(criado_em desc);

-- ── Log de acesso e de exportação ────────────────────────────────────────────
-- Este painel guarda situação migratória de pessoas em situação irregular e de
-- solicitantes de refúgio: dado pessoal sensível sob a LGPD e, em alguns casos,
-- informação que exposta causa dano real à pessoa. Quem abriu e quem exportou fica
-- registrado, com autor e data.
create table if not exists access_log (
  id uuid default gen_random_uuid() primary key,
  autor text not null,
  papel text,
  acao text not null,           -- 'abriu_lead' | 'exportou' | 'listou_filtradas' | ...
  alvo_tipo text,
  alvo_id text,
  detalhe text,
  ip text,
  criado_em timestamptz default now()
);
create index if not exists idx_access_log_data on access_log(criado_em desc);
create index if not exists idx_access_log_autor on access_log(autor);

alter table lead_reclassificacoes enable row level security;
alter table access_log enable row level security;

-- ── Papéis ───────────────────────────────────────────────────────────────────
-- advogado: acesso total. atendente: fila e detalhe, SEM exportação. admin: além disso,
-- usuários, retenção e log de acesso. O 'user' herdado continua aceito e é lido como
-- atendente (o papel mais restrito) — nenhuma conta ganha permissão por migration.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'users'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table users drop constraint %I', c.conname);
  end loop;
end $$;

alter table users add constraint users_role_check
  check (role in ('admin','advogado','atendente','user'));

-- ── Retrocompatibilidade ─────────────────────────────────────────────────────
-- `region` já guardava, em texto legível, onde a pessoa está ("Brasil — Boa Vista",
-- "Exterior — Venezuela"). A fila precisa do par estruturado. Converter aqui evita que
-- todo lead anterior a esta migration apareça sem localização — e o `where localizacao
-- is null` garante que rodar de novo não sobrescreve correção feita à mão.
update leads set localizacao = 'brasil'
  where localizacao is null and region ilike 'brasil%';
update leads
  set localizacao = 'exterior',
      pais_exterior = coalesce(pais_exterior, nullif(trim(split_part(region, '—', 2)), ''))
  where localizacao is null and region ilike 'exterior%';

-- A nacionalidade morava em `client_type` (o campo que na base de origem guardava o tipo
-- de cliente). Agora tem coluna própria; o valor antigo vem junto.
update leads set nacionalidade = client_type
  where nacionalidade is null and client_type is not null;

-- Idem para a situação documental, que ocupava `contract_duration`.
update leads set situacao_documental = contract_duration
  where situacao_documental is null and contract_duration is not null;
