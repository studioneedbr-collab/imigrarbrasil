-- 029 — O FOLLOW-UP DEIXA DE SER "24H SEM RESPOSTA" E PASSA A SER SOBRE O QUE SE ESPERA.
--
-- O que existia era cadência de vendas: 24h de silêncio → uma mensagem de retomada. Em
-- imigração isso não descreve nada. A pessoa some três semanas porque está esperando
-- certidão do consulado, apostilamento, tradução juramentada ou agendamento na Polícia
-- Federal — e nada disso anda mais rápido porque alguém perguntou se ela ainda tem
-- interesse. Perguntar isso comunica, com clareza, que o escritório não sabe em que pé
-- está o caso dela.
--
-- Então o dado que faltava não era um contador: era O MOTIVO DA ESPERA.

-- ─── O QUE ESTAMOS ESPERANDO, E PARA QUANDO ───
alter table leads add column if not exists espera_motivo text;
alter table leads add column if not exists espera_desde timestamptz;
alter table leads add column if not exists proximo_toque_em timestamptz;
-- Quantos toques já saíram NESTE motivo. Zera quando a pessoa responde e quando o motivo
-- muda: quem esperou o consulado, respondeu, e agora espera pagamento começa do zero.
alter table leads add column if not exists toques_no_motivo int not null default 0;

alter table leads drop constraint if exists leads_espera_motivo_check;
alter table leads add constraint leads_espera_motivo_check
  check (espera_motivo is null or espera_motivo in (
    'documento_com_cliente','consulado','policia_federal',
    'traducao_apostilamento','decisao_proposta','pagamento','retomar_depois'));

-- A varredura do cron e o bloco "Follow-ups de hoje" fazem a mesma pergunta: o que vence
-- agora? Sem este índice, ela é uma varredura da tabela inteira a cada passagem.
create index if not exists leads_proximo_toque on leads (proximo_toque_em)
  where proximo_toque_em is not null;

-- ─── OS MODELOS, POR MOTIVO E POR IDIOMA ───
--
-- ESTE É O PONTO QUE NÃO PODE FALHAR. Mandar follow-up em português para um haitiano
-- destrói o produto — e destrói mais do que uma mensagem perdida: comunica que ninguém do
-- outro lado percebeu com quem está falando, para uma pessoa que já desconfia de
-- instituição.
--
-- NÃO HÁ IDIOMA DE RESERVA, e a ausência é a regra: sem modelo na língua da pessoa, o
-- disparo não acontece e vira tarefa para alguém escrever à mão. Um fallback para
-- português faria o defeito voltar sem ninguém perceber, porque tudo continuaria
-- "funcionando".
create table if not exists followup_modelos (
  id uuid primary key default gen_random_uuid(),
  motivo text not null,
  -- ISO-639-1 do texto: 'pt', 'es', 'en', 'fr', 'ht'…
  idioma text not null,
  texto text not null,
  -- Outras redações do MESMO recado. Não são versões melhores: existem para que dez
  -- pessoas esperando o consulado não recebam a frase idêntica no mesmo dia, do mesmo
  -- número — que é a assinatura de disparo em massa que os classificadores procuram.
  variantes text[] not null default '{}',
  -- 'rascunho' (padrão) cai na fila do responsável com enviar/editar/pular. 'automatico'
  -- sai sozinho, e só deve ser ligado para modelo simples e revisado.
  envio text not null default 'rascunho' check (envio in ('rascunho','automatico')),
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um modelo por (motivo, idioma). Dois seria uma escolha silenciosa entre eles a cada
-- disparo, e ninguém saberia qual texto a pessoa recebeu.
create unique index if not exists followup_modelos_unico
  on followup_modelos (motivo, idioma);

-- ─── O HISTÓRICO: TODO TOQUE, COM O QUE FOI ENVIADO ───
--
-- Na linha do tempo do caso tem de caber a pergunta inteira: quando, por qual canal, com
-- qual modelo, em qual idioma, aprovado por quem, com que texto — e se houve resposta.
-- Sem o texto gravado, um modelo editado depois reescreve retroativamente o que a pessoa
-- recebeu, e a conversa passa a mentir.
create table if not exists followup_toques (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  instancia_id uuid,
  motivo text not null,
  idioma text,
  modelo_id uuid references followup_modelos(id) on delete set null,
  canal text not null default 'whatsapp',
  texto text not null,
  -- 'rascunho' espera aprovação · 'enviado' saiu · 'pulado' o responsável leu e recusou ·
  -- 'cancelado' o caso mudou antes de sair · 'tarefa' virou trabalho manual (sem modelo
  -- no idioma, ou prazo processual, que se resolve por ligação) · 'feito' a tarefa foi
  -- cumprida por alguém.
  --
  -- 'pulado' e 'feito' são estados diferentes de propósito: pular é dado sobre o MODELO
  -- (um modelo pulado toda vez está errado), cumprir é dado sobre a OPERAÇÃO. Somá-los
  -- apagaria as duas leituras de uma vez.
  status text not null default 'rascunho'
    check (status in ('rascunho','enviado','pulado','cancelado','tarefa','feito')),
  -- Qual toque da sequência é este (1, 2, 3). É o que fecha a sequência no terceiro.
  toque int not null default 1,
  aprovado_por text,
  enviado_em timestamptz,
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists followup_toques_lead on followup_toques (lead_id, criado_em desc);
create index if not exists followup_toques_pendentes on followup_toques (status, criado_em)
  where status = 'rascunho';
-- O teto diário por instância se conta daqui.
create index if not exists followup_toques_do_dia on followup_toques (instancia_id, enviado_em)
  where enviado_em is not null;

-- ─── OPT-OUT COM RASTRO ───
--
-- A data já era gravada. Faltava A MENSAGEM QUE ORIGINOU o pedido: sem ela, seis meses
-- depois ninguém consegue dizer se o contato foi silenciado porque pediu ou porque uma
-- regex casou com uma frase parecida. Exigência de LGPD e de bom senso.
alter table conversations add column if not exists opt_out_mensagem text;
alter table conversations add column if not exists no_followup_mensagem text;

-- ─── O TETO DIÁRIO, POR INSTÂNCIA ───
--
-- Por instância e não global: um escritório com dois números não deve ter o volume do
-- segundo limitado pelo do primeiro, e é a instância que é banida, não a conta.
alter table zapi_instancias add column if not exists teto_followups_dia int not null default 40;
