-- 032 — "PROPOSTA ENVIADA" PASSA A CABER NA COLUNA QUE A GUARDA.
--
-- A 019 criou `leads.atendimento_status` com um check de cinco valores. A 027 criou a
-- etapa comercial, acrescentou 'proposta_enviada' ao domínio, ao quadro e ao check de
-- `crm_etapas.status` — e anotou, com todas as letras:
--
--     "`atendimento_status` é texto sem check na tabela `leads`, então não há
--      constraint a alterar aqui."
--
-- A anotação estava errada. O check existia desde a 019, e ficou para trás.
--
-- O QUE ISSO QUEBRAVA, e por que ninguém viu: arrastar um card para "Proposta enviada"
-- no CRM falhava no banco. A tela mostra a coluna, o domínio conhece o status, a fila
-- ordena por ele, o relatório conta por ele — e a gravação era recusada. A suíte não
-- pegou porque ela roda contra o repositório em memória, que não tem constraint nenhuma:
-- o único lugar onde esta regra existe é aqui, e aqui ninguém estava olhando.
--
-- Apareceu na carga inicial da planilha do comercial, em que 22 dos 76 casos estão
-- exatamente nesta etapa. A transação inteira voltou atrás, que é o comportamento certo —
-- e foi o que transformou um defeito silencioso de produção em um erro que se lê.
--
-- Ver tests/constraints-e-dominio.test.ts: o teste que compara esta lista com a do
-- código existe para que a próxima divergência não precise de uma carga de 76 leads para
-- ser descoberta.

alter table leads drop constraint if exists leads_atendimento_status_check;
alter table leads add constraint leads_atendimento_status_check
  check (atendimento_status in (
    'novo','em_atendimento','proposta_enviada','agendado','fechado','perdido'
  ));
