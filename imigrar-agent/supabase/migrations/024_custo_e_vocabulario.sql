-- 024 — O CUSTO DE CADA CHAMADA, E UM VOCABULÁRIO SÓ.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. "deepseek_falhou" ERA O NOME DO FORNECEDOR, NÃO O NOME DO PROBLEMA.
--
-- O tipo de evento nasceu quando havia um provedor só. Com dois (DeepSeek escreve e lê
-- documento, OpenAI transcreve e vetoriza), o nome passou a mentir de duas formas: uma
-- falha da OpenAI não teria onde ser gravada, e a tela de falhas do modelo ficou pendurada
-- na rota dos áudios — quem clicava em "quedas do agente" caía na tela de transcrição.
--
-- O nome novo é o do problema: a chamada ao modelo falhou. Quem falhou é a coluna do
-- provedor, na tabela nova, logo abaixo.
-- ─────────────────────────────────────────────────────────────────────────────
alter table eventos_operacao drop constraint if exists eventos_operacao_tipo_check;
update eventos_operacao set tipo = 'llm_falhou' where tipo = 'deepseek_falhou';
alter table eventos_operacao add constraint eventos_operacao_tipo_check
  check (tipo in ('transcricao_falhou', 'llm_falhou', 'documento_falhou'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O CUSTO NÃO ESTAVA SENDO MEDIDO — ESTAVA SENDO ADIVINHADO PELO SALDO.
--
-- O painel mostrava "4.76 USD" no rodapé da barra lateral. Aquilo era o SALDO da conta
-- do DeepSeek, não gasto: não dizia se era do dia, do mês ou de sempre, não incluía a
-- OpenAI (transcrição e embeddings, que nem aparecem no saldo do DeepSeek), e caía
-- quando alguém recarregava a conta — ou seja, o número descia quando o gasto subia.
--
-- O número que fecha preço com cliente é OUTRO: quanto custa, em média, atender UMA
-- conversa. Ele não sai de saldo nenhum; sai de somar chamada por chamada e dividir
-- pelas conversas. Por isso cada chamada vira uma linha aqui.
--
-- E a quebra por modelo e por tipo de chamada não é enfeite: é o único jeito de saber
-- se a separação entre modelo pequeno e modelo grande está de fato acontecendo. Sem
-- ela, "estamos usando o modelo barato para classificar" é uma intenção, não um fato.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists chamadas_llm (
  id uuid default gen_random_uuid() primary key,
  provedor text not null,
  modelo text not null,
  tipo text not null check (tipo in ('redacao', 'extracao', 'classificacao', 'transcricao', 'embedding')),
  -- Nulo quando a chamada não pertence a uma conversa (embedding de busca no painel,
  -- teste de conexão). O custo POR CONVERSA só considera as que têm dono — misturar as
  -- duas coisas inflaria a média com trabalho que não é atendimento.
  conversation_id uuid references conversations(id) on delete set null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  -- Transcrição é cobrada por tempo de áudio, não por token. A coluna existe para o
  -- custo dela sair da mesma conta que o resto, em vez de ficar de fora por não caber
  -- no formato dos outros.
  segundos numeric(10, 2),
  custo_usd numeric(12, 6) not null default 0,
  -- Falso quando o modelo não está na tabela de preços do código. É a diferença entre
  -- "custou zero" e "não sei quanto custou" — e a tela precisa dizer qual dos dois é.
  preco_conhecido boolean not null default true,
  duracao_ms integer,
  ok boolean not null default true,
  erro text,
  criado_em timestamptz default now()
);

comment on table chamadas_llm is
  'Uma linha por chamada a provedor de IA. É daqui que sai o custo médio por conversa — o número que fecha a precificação com o cliente.';
comment on column chamadas_llm.preco_conhecido is
  'Falso = modelo fora da tabela de preços. A tela mostra "sem preço na tabela" em vez de somar zero e mentir.';

-- As três leituras que existem: o período das métricas, a saúde de um provedor nas
-- últimas 24h, e o custo agrupado por conversa.
create index if not exists idx_chamadas_periodo on chamadas_llm (criado_em desc);
create index if not exists idx_chamadas_provedor on chamadas_llm (provedor, criado_em desc);
create index if not exists idx_chamadas_conversa on chamadas_llm (conversation_id)
  where conversation_id is not null;

alter table chamadas_llm enable row level security;
