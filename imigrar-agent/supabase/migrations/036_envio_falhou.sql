-- ─────────────────────────────────────────────────────────────────────────────
-- O ENVIO QUE FALHOU NÃO PODE FALHAR EM SILÊNCIO.
--
-- O webhook gravava a resposta da agente no histórico e só depois mandava pela Z-API.
-- Quando a Z-API recusava (token trocado, instância desconectada, boleto vencido), o erro
-- ia para o log do servidor e para nenhum outro lugar: o painel mostrava a conversa
-- respondida e o cliente não tinha recebido nada. Agora vira evento de operação.
-- ─────────────────────────────────────────────────────────────────────────────
-- A lista inteira de novo, como na 025: um check não se acrescenta em pedaços.
alter table eventos_operacao drop constraint if exists eventos_operacao_tipo_check;
alter table eventos_operacao add constraint eventos_operacao_tipo_check
  check (tipo in ('transcricao_falhou', 'llm_falhou', 'documento_falhou', 'parecer_barrado', 'envio_falhou'));
