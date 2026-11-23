-- ─────────────────────────────────────────────────────────────────────────────
-- A PERGUNTA REPETIDA VIRA NÚMERO.
--
-- Quando a resposta da agente pergunta de novo algo que a ficha já tem (nome,
-- nacionalidade, onde a pessoa está), ela é reescrita antes de sair. Cada reescrita fica
-- registrada, para o time saber se o treino está melhorando ou piorando isso.
--
-- Sem esta migration nada quebra: a reescrita acontece do mesmo jeito, só o registro é
-- recusado pelo banco.
-- ─────────────────────────────────────────────────────────────────────────────
-- A lista inteira de novo, como na 025 e na 036: um check não se acrescenta em pedaços.
alter table eventos_operacao drop constraint if exists eventos_operacao_tipo_check;
alter table eventos_operacao add constraint eventos_operacao_tipo_check
  check (tipo in ('transcricao_falhou', 'llm_falhou', 'documento_falhou', 'parecer_barrado', 'envio_falhou', 'pergunta_repetida'));
