-- 023 — A ATIVAÇÃO DO AGENTE, EM TRÊS NÍVEIS.
--
-- Até aqui, "a Ana está ligada?" não era uma pergunta que o sistema soubesse responder.
-- Havia UMA credencial Z-API no banco e a única forma de calar o agente era apagá-la —
-- o que também derruba a ENTRADA das mensagens. Desligar significava ficar cego.
--
-- Isso torna impossível a coisa mais óbvia que uma equipe quer fazer antes de soltar um
-- agente em cima de gente de verdade: rodar contra conversa real sem responder nada.
--
-- São três níveis, e a independência entre eles é o ponto:
--
--   NÍVEL 1  chave geral    — vale para tudo. Vive em agent_config (não precisa de tabela).
--   NÍVEL 2  instância      — esta migration. Ambiente e ativação próprios por instância.
--   NÍVEL 3  conversa       — já existia em conversations.assumed_by.
--
-- E o que realmente importa não é o botão, é o COMPORTAMENTO COM O AGENTE DESLIGADO.
-- Nenhum caminho aqui descarta mensagem: ela chega, é gravada e aparece no painel. O que
-- muda é só o que volta para o cliente — ver a coluna `modo_desligado`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AS INSTÂNCIAS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists zapi_instancias (
  id uuid default gen_random_uuid() primary key,
  nome text not null,

  -- AMBIENTE. Não é rótulo: é o que separa operação real de ensaio. Conversa de teste
  -- não entra nas métricas nem na fila de trabalho — sem esta coluna, a primeira semana
  -- de testes envenena o histórico de um jeito que ninguém desfaz depois.
  ambiente text not null default 'teste' check (ambiente in ('teste','producao')),

  instance_id text not null,
  token text not null,
  client_token text,
  base_url text not null default 'https://api.z-api.io',

  -- ATIVAÇÃO PRÓPRIA. Ligar a de teste não pode ligar a de produção: são duas linhas
  -- diferentes, e nada no código lê uma para decidir a outra.
  ativo boolean not null default false,
  ativado_por text,
  ativado_em timestamptz,

  -- O QUE ACONTECE COM A MENSAGEM QUANDO O AGENTE ESTÁ DESLIGADO.
  --   silencio       nada volta. SÓ em instância de teste (o check abaixo garante).
  --   resposta_fixa  avisa que um humano responde, e quando.
  --   sombra         processa normal, GRAVA a resposta que teria dado, não envia.
  -- O padrão é sombra porque é o modo que vale mais durante os testes: dá para avaliar
  -- a Ana contra conversa real sem risco nenhum.
  modo_desligado text not null default 'sombra'
    check (modo_desligado in ('silencio','resposta_fixa','sombra')),
  resposta_fixa text,

  -- SLA da primeira resposta humana, em minutos de EXPEDIENTE (ver lib/agent/expediente.ts:
  -- minutosDeExpedienteEntre). Tempo corrido faria toda mensagem de sexta à noite nascer
  -- estourada na segunda, e um SLA que sempre está vermelho é um SLA que ninguém olha.
  sla_minutos int not null default 30 check (sla_minutos > 0),

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (instance_id)
);

comment on table zapi_instancias is
  'Instâncias da Z-API, cada uma com ambiente (teste/producao) e ativação próprios. Nasce sempre em teste e desligada — o trigger abaixo força isso.';

-- SILÊNCIO TOTAL É PRIVILÉGIO DE TESTE.
--
-- Em produção, do outro lado do número tem alguém em situação irregular que escreveu
-- pedindo ajuda. Deixá-la sem NENHUMA resposta é o pior desfecho possível — pior que
-- uma resposta errada, que ao menos é visível e corrigível. A regra é do banco, e não
-- da UI, porque a UI é onde as regras vazam.
alter table zapi_instancias drop constraint if exists silencio_so_em_teste;
alter table zapi_instancias add constraint silencio_so_em_teste
  check (modo_desligado <> 'silencio' or ambiente = 'teste');

-- INSTÂNCIA NOVA NASCE EM TESTE E DESLIGADA — E ISSO NÃO SE BURLA.
--
-- Um default de coluna é uma sugestão: qualquer INSERT que passe `ambiente` a ignora.
-- Este trigger não. Cadastrar uma instância já em produção e já ligada exige DOIS gestos
-- deliberados depois (promover, e então ativar), cada um com o seu registro de auditoria.
-- É a diferença entre "eu quis" e "eu não percebi".
create or replace function zapi_instancia_nasce_desligada()
returns trigger language plpgsql as $$
begin
  new.ambiente := 'teste';
  new.ativo := false;
  new.ativado_por := null;
  new.ativado_em := null;
  return new;
end;
$$;

drop trigger if exists trg_zapi_instancia_nasce_desligada on zapi_instancias;
create trigger trg_zapi_instancia_nasce_desligada
  before insert on zapi_instancias
  for each row execute function zapi_instancia_nasce_desligada();

-- O webhook resolve a instância pelo `instanceId` que a Z-API manda no payload.
create index if not exists idx_zapi_instancias_instance on zapi_instancias (instance_id);
create index if not exists idx_zapi_instancias_ativas on zapi_instancias (ambiente, ativo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A CONVERSA SABE ONDE ACONTECEU — E SE ESTÁ ESPERANDO GENTE
-- ─────────────────────────────────────────────────────────────────────────────
alter table conversations add column if not exists instancia_id uuid
  references zapi_instancias(id) on delete set null;

-- Gravado na criação e NUNCA reescrito. Se a instância for promovida de teste a produção
-- amanhã, o que já aconteceu continua tendo acontecido em teste — reescrever seria
-- inventar histórico, e é justamente o histórico que as métricas leem.
alter table conversations add column if not exists ambiente text not null default 'producao'
  check (ambiente in ('teste','producao'));

comment on column conversations.ambiente is
  'Onde esta conversa aconteceu. Conversa de teste não entra nas métricas nem na fila de trabalho. Default producao para não reclassificar o histórico anterior a esta migration.';

-- O RELÓGIO DA PRIMEIRA RESPOSTA HUMANA.
--
-- É esta coluna que impede "desligado" de virar "ignorado". Preenchida quando a mensagem
-- chega com o agente desligado; zerada no instante em que um humano responde ou assume.
-- Enquanto estiver preenchida, a conversa está na fila esperando gente — e sobe quando o
-- SLA estoura.
alter table conversations add column if not exists aguardando_humano_desde timestamptz;

create index if not exists idx_conversations_aguardando
  on conversations (aguardando_humano_desde)
  where aguardando_humano_desde is not null;

create index if not exists idx_conversations_ambiente on conversations (ambiente);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MODO SOMBRA — A RESPOSTA QUE NÃO FOI ENVIADA
--
-- O agente lê a mensagem real, monta a resposta, e ela para aqui em vez de ir para o
-- WhatsApp. No painel ganha três saídas: enviar como está, editar antes de enviar,
-- descartar.
--
-- `texto` é o que a Ana escreveu; `texto_enviado` é o que a pessoa de fato mandou. Guardar
-- os dois é o ponto inteiro da tabela: o par (um diferente do outro) é o que mostra ONDE
-- ela erra. Só o texto final não ensina nada — e o descarte com motivo ensina mais ainda.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists rascunhos_agente (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  -- A mensagem do cliente que provocou este rascunho.
  message_id uuid references messages(id) on delete set null,
  texto text not null,
  botoes jsonb,
  status text not null default 'pendente' check (status in ('pendente','enviado','descartado')),
  texto_enviado text,
  motivo text,
  decidido_por text,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table rascunhos_agente is
  'Modo sombra: a resposta que o agente teria dado, gravada e não enviada. Cada descarte e cada edição vira dado de treinamento.';

-- A fila de sombra pergunta sempre "o que está esperando decisão".
create index if not exists idx_rascunhos_pendentes on rascunhos_agente (criado_em desc)
  where status = 'pendente';
create index if not exists idx_rascunhos_conversa on rascunhos_agente (conversation_id, criado_em desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A INSTÂNCIA QUE JÁ EXISTE
--
-- Há uma credencial Z-API em agent_config['zapi'] atendendo gente de verdade agora. Ela
-- vira uma linha aqui como PRODUÇÃO e LIGADA — o deploy não muda nada do comportamento
-- de hoje. A regra "nasce em teste e desligada" vale para instâncias criadas daqui em
-- diante; aplicá-la retroativamente faria o WhatsApp da empresa emudecer no instante do
-- deploy, sem ninguém ter pedido isso.
--
-- O UPDATE depois do INSERT existe porque o trigger acima reescreve ambiente/ativo em
-- TODO insert, inclusive neste. É a prova de que a trava funciona.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  cfg jsonb;
  novo_id uuid;
begin
  select value into cfg from agent_config where key = 'zapi';
  if cfg is null or coalesce(cfg->>'instanceId','') = '' or coalesce(cfg->>'token','') = '' then
    return;
  end if;
  if exists (select 1 from zapi_instancias where instance_id = cfg->>'instanceId') then
    return;
  end if;

  insert into zapi_instancias (nome, instance_id, token, client_token, base_url, modo_desligado)
  values (
    'Produção (WhatsApp da Imigrar Brasil)',
    cfg->>'instanceId',
    cfg->>'token',
    nullif(cfg->>'clientToken',''),
    coalesce(nullif(cfg->>'baseUrl',''), 'https://api.z-api.io'),
    'sombra'
  )
  returning id into novo_id;

  update zapi_instancias
     set ambiente = 'producao',
         ativo = true,
         ativado_por = 'migration 023',
         ativado_em = now()
   where id = novo_id;

  -- Todo o histórico anterior aconteceu nesta instância, em produção.
  update conversations set instancia_id = novo_id where instancia_id is null;
end $$;
